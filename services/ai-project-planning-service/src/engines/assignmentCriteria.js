/**
 * Assignment criterion registry — named hard/soft signals (0..1).
 * Does NOT know policy weights; callers pass weights from resolved policy.
 */

const { normalizeRoleKey } = require('./roleKey');
const { simulateTaskCapacity } = require('./matchingCapacitySim');

const SOFT_KEYS = Object.freeze([
  'skillFit',
  'similarExperience',
  'pastQuality',
  'scheduleConvenience',
  'domainArchFit',
  'resourceEfficiency',
]);

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, Math.round(n * 1000) / 1000));
}

function skillNameMatch(a, b) {
  const x = String(a || '')
    .toLowerCase()
    .trim();
  const y = String(b || '')
    .toLowerCase()
    .trim();
  if (!x || !y) return false;
  if (x === y) return true;
  return x.includes(y) || y.includes(x);
}

function skillsFromItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) return item.skills;
  return Array.isArray(item?.capability?.skills) ? item.capability.skills : [];
}

function canonicalSkillIds(list = []) {
  return [
    ...new Set(
      (list || [])
        .map((id) => String(id || '').trim().toUpperCase())
        .filter((id) => id && id !== 'SK-UNMAPPED')
    ),
  ];
}

function requiredSkillNames(container, task) {
  const skills = new Set(
    (container?.planning?.skills || [])
      .map((skill) => String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase())
      .filter(Boolean)
  );
  for (const id of task?.sourceCapabilityIds || []) {
    const capability = (container?.analyses?.capability?.items || []).find(
      (item) => item.capabilityId === id
    );
    for (const skill of capability?.requiredSkills || []) {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      if (name) skills.add(name);
    }
  }
  for (const skill of task?.requiredSkills || task?.skills || []) {
    const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
    if (name) skills.add(name);
  }
  return skills;
}

function skillCoverageRatio(item, needNames, requiredSkillIds = []) {
  const reqIds = canonicalSkillIds(requiredSkillIds);
  const empIds = new Set(canonicalSkillIds(item.skillCanonicalIds || []));
  const skills = skillsFromItem(item);
  if (reqIds.length && empIds.size) {
    return reqIds.filter((id) => empIds.has(id)).length / reqIds.length;
  }
  if (!needNames?.size) return null;
  let hits = 0;
  for (const need of needNames) {
    const matched = skills.some((skill) => {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      return skillNameMatch(name, need);
    });
    if (matched) hits += 1;
  }
  return hits / needNames.size;
}

function roleMatches(item, task) {
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  if (!roleKey) return { matched: true, required: false };
  const itemRoles = [item.projectRoleKey, item.jobTitle, ...(item.inferredRoleKeys || [])]
    .map(normalizeRoleKey)
    .filter(Boolean);
  const matched = itemRoles.some((role) => role.includes(roleKey) || roleKey.includes(role));
  return { matched, required: true };
}

function isAtProjectCap(item) {
  const max = Number(item?.maxConcurrentProjects ?? item?.resourceConfig?.maxConcurrentProjects);
  const active = Number(item?.activeProjectCount ?? item?.activeProjects ?? item?.projectCount);
  return Number.isFinite(max) && max > 0 && Number.isFinite(active) && active >= max;
}

function availableCapacityHours(item) {
  const HOURS_PER_FTE = 40;
  return Math.round((Number(item?.capacityRemaining) || 0) * HOURS_PER_FTE * 100) / 100;
}

function isSoftOverloaded(item, taskHours, reservedHours = 0) {
  const capacityRemaining = Number(item?.capacityRemaining);
  const threshold = 0.15;
  if (Number.isFinite(capacityRemaining) && capacityRemaining < threshold) return true;
  const available = Math.max(0, availableCapacityHours(item) - (Number(reservedHours) || 0));
  if (Number.isFinite(taskHours) && taskHours > 0 && available < taskHours) return true;
  return false;
}

/** Soft scorers: { score: 0..1|null, available: boolean } — null = missing signal */
const SOFT_SCORERS = {
  skillFit(ctx) {
    const ratio = skillCoverageRatio(ctx.item, ctx.needNames, ctx.requiredSkillIds);
    if (ratio == null) return { score: null, available: false };
    return { score: clamp01(ratio), available: true };
  },
  similarExperience(ctx) {
    const { item, task, needNames } = ctx;
    // Missing SoT (undefined) → unavailable; empty array → known zero (do not redistribute).
    if (!Array.isArray(item?.history)) {
      return { score: null, available: false };
    }
    if (!item.history.length) {
      return { score: 0, available: true };
    }
    let roleHit = false;
    let domainHit = false;
    let workHit = false;
    const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
    for (const row of item.history) {
      const historyRole = normalizeRoleKey(row?.role || row?.projectRole);
      roleHit ||= Boolean(
        roleKey && historyRole && (roleKey.includes(historyRole) || historyRole.includes(roleKey))
      );
      const domain = String(row?.domain || row?.businessDomain || '')
        .toLowerCase()
        .trim();
      if (domain && needNames?.size) {
        domainHit ||= [...needNames].some((s) => domain.includes(s) || s.includes(domain));
      }
      const workBlob = String(row?.work || row?.projectName || '')
        .toLowerCase()
        .trim();
      if (workBlob && needNames?.size) {
        workHit ||= [...needNames].some((skill) => {
          const s = String(skill || '').toLowerCase();
          return s.length >= 2 && workBlob.includes(s);
        });
      }
    }
    if (!roleHit && !domainHit && !workHit) {
      return { score: 0, available: true };
    }
    const score = clamp01((roleHit ? 0.5 : 0) + (domainHit ? 0.3 : 0) + (workHit ? 0.2 : 0));
    return { score, available: true };
  },
  pastQuality() {
    // No SoT yet — signal missing → caller redistributes weights
    return { score: null, available: false };
  },
  scheduleConvenience(ctx) {
    const available = Math.max(0, Number(ctx.availableHours) || 0);
    const taskHours = Math.max(0, Number(ctx.taskHours) || 0);
    if (!taskHours) return { score: null, available: false };
    if (available <= 0) return { score: 0, available: true };
    // More slack above task hours ⇒ more convenient (cap at 2× effort)
    const slack = available / taskHours;
    return { score: clamp01(Math.min(1, slack / 2)), available: true };
  },
  domainArchFit(ctx) {
    const tokens = ctx.domainTokens || [];
    const area = String(ctx.task?.area || '')
      .toLowerCase()
      .trim();
    const item = ctx.item;
    const blob = [
      item.primaryDomain,
      item.jobTitle,
      item.projectRoleKey,
      ...(item.capability?.businessDomains || []),
      ...(item.history || []).map((h) => h.domain || h.businessDomain),
      ...(item.inferredRoleKeys || []),
    ]
      .map((x) => String(x || '').toLowerCase())
      .join(' ');
    if (!blob.trim()) return { score: null, available: false };
    let hits = 0;
    let total = 0;
    for (const token of tokens) {
      const t = String(token || '').toLowerCase();
      if (!t) continue;
      total += 1;
      if (blob.includes(t)) hits += 1;
    }
    const patterns = {
      frontend: /front|react|vue|angular|ui|ux|css/,
      backend: /back|api|node|java|server|\.net|spring/,
      qa: /qa|test|quality|sdet/,
      design: /design|ux|figma|ui/,
      infrastructure: /devops|sre|infra|k8s|cloud|ops/,
      infra: /devops|sre|infra|k8s|cloud|ops/,
      devops: /devops|sre|infra|k8s|cloud|ops/,
      database: /dba|sql|data|database/,
      auth: /auth|security|iam/,
      security: /security|iam|auth/,
    };
    if (area && patterns[area]) {
      total += 1;
      if (patterns[area].test(blob)) hits += 1;
    }
    if (!total) return { score: null, available: false };
    return { score: clamp01(hits / total), available: true };
  },
  resourceEfficiency(ctx) {
    const item = ctx.item;
    const task = ctx.task;
    const container = ctx.container || {};
    const complexity = (task?.sourceCapabilityIds || [])
      .map((id) =>
        (container?.analyses?.capability?.items || []).find((c) => c.capabilityId === id)
      )
      .find(Boolean)?.complexity;
    const level = Number(item.seniorityLevel || item.level || 0);
    if (!complexity && !level) return { score: null, available: false };
    // Prefer adequate seniority without extreme over-seniority waste
    if (complexity === 'high') {
      if (level >= 4) return { score: 1, available: true };
      if (level >= 3) return { score: 0.7, available: true };
      return { score: 0.3, available: true };
    }
    if (complexity === 'medium') {
      if (level >= 2 && level <= 3) return { score: 1, available: true };
      if (level >= 4) return { score: 0.6, available: true };
      return { score: 0.4, available: true };
    }
    if (level >= 1) return { score: 0.8, available: true };
    return { score: 0.5, available: true };
  },
};

/**
 * Build soft context for scorers.
 */
function buildSoftContext({
  item,
  task,
  container = {},
  requiredSkillIds = [],
  domainTokens = [],
  taskHours = 0,
  availableHours = null,
  reservedHours = 0,
} = {}) {
  const needNames = requiredSkillNames(container, task);
  const hours =
    availableHours != null
      ? Number(availableHours)
      : Math.max(0, availableCapacityHours(item) - (Number(reservedHours) || 0));
  return {
    item,
    task,
    container,
    needNames,
    requiredSkillIds,
    domainTokens,
    taskHours: Number(taskHours) || 0,
    availableHours: hours,
    reservedHours: Number(reservedHours) || 0,
  };
}

/**
 * Score all soft criteria; returns breakdown + missing keys.
 */
function scoreSoft(ctxInput, rankWeights = {}) {
  const ctx = buildSoftContext(ctxInput);
  const breakdown = {};
  const missing = [];
  for (const key of SOFT_KEYS) {
    const fn = SOFT_SCORERS[key];
    const result = fn(ctx);
    if (!result.available || result.score == null) {
      missing.push(key);
      breakdown[key] = null;
    } else {
      breakdown[key] = clamp01(result.score);
    }
  }
  // Dot-product only — callers must redistribute missing weights first (no silent renormalize).
  let score = 0;
  for (const key of SOFT_KEYS) {
    const w = Number(rankWeights[key]) || 0;
    if (w <= 0) continue;
    if (breakdown[key] == null) continue;
    score += w * breakdown[key];
  }
  return {
    score: clamp01(score),
    breakdown,
    missing,
    needNames: ctx.needNames,
  };
}

/**
 * Evaluate hard gates from policy.hardGates.
 * @returns {{ pass: boolean, reasons: string[], skillCoverage: number|null }}
 */
function evaluateHard(ctxInput, hardGates = {}) {
  const ctx = buildSoftContext(ctxInput);
  const reasons = [];
  const item = ctx.item;
  const task = ctx.task;

  if (hardGates.respectProjectCap && isAtProjectCap(item)) {
    reasons.push('project_cap');
  }

  if (hardGates.requireRoleMatch) {
    const role = roleMatches(item, task);
    if (role.required && !role.matched) reasons.push('role_mismatch');
  }

  const coverage = skillCoverageRatio(item, ctx.needNames, ctx.requiredSkillIds);
  if (hardGates.minSkillCoverage != null && Number(hardGates.minSkillCoverage) > 0) {
    const min = Number(hardGates.minSkillCoverage);
    if (ctx.needNames.size || (ctx.requiredSkillIds || []).length) {
      if (coverage == null || coverage < min) reasons.push('skill_below_min');
    }
  }

  if (hardGates.excludeSoftOverload) {
    if (isSoftOverloaded(item, ctx.taskHours, ctx.reservedHours)) {
      reasons.push('soft_overload');
    }
  }

  if (hardGates.capacityWindowFeasible) {
    const sim = simulateTaskCapacity({
      userId: item.userId,
      effortHours: ctx.taskHours,
      bookedHoursByUserDay: ctxInput.bookedHoursByUserDay || null,
      startDate: ctxInput.startDate || null,
      reservedHoursByUser: ctxInput.reservedHoursByUser || null,
    });
    if (sim.feasible === false) {
      for (const r of sim.reasons || []) reasons.push(r);
      if (!reasons.includes('capacity_infeasible')) reasons.push('capacity_infeasible');
    }
    // forecast overload from item
    const forecastPct = Number(item.forecastWorkloadPct);
    if (Number.isFinite(forecastPct) && ctx.taskHours > 0) {
      const HOURS_PER_FTE = 40;
      const reservedPct = ((Number(ctx.reservedHours) || 0) / HOURS_PER_FTE) * 100;
      const addPct = (ctx.taskHours / HOURS_PER_FTE) * 100;
      if (forecastPct + reservedPct + addPct > 100) reasons.push('forecast_overload');
    }
  }

  return {
    pass: reasons.length === 0,
    reasons: [...new Set(reasons)],
    skillCoverage: coverage,
  };
}

module.exports = {
  SOFT_KEYS,
  SOFT_SCORERS,
  buildSoftContext,
  scoreSoft,
  evaluateHard,
  skillCoverageRatio,
  requiredSkillNames,
  roleMatches,
  isAtProjectCap,
  availableCapacityHours,
  isSoftOverloaded,
  skillNameMatch,
  skillsFromItem,
  canonicalSkillIds,
  clamp01,
};
