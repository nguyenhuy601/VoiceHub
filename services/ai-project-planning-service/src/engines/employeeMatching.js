/**
 * Ported from project-service matching — Fit → Feasible → featureOwner (HARD-02 one path).
 */
const { normalizeRoleKey } = require('./roleKey');
const { computeFitScore } = require('./matchingFit');
const {
  simulateTaskCapacity,
  reserveHours,
} = require('./matchingCapacitySim');
const { assignFeatureOwners } = require('./featureOwnerAssign');

const SHORTLIST_K = 5;
const HOURS_PER_FTE = 40;
const OVERLOAD_CAPACITY_THRESHOLD = 0.15;

function skillsFromPoolItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) return item.skills;
  return Array.isArray(item?.capability?.skills) ? item.capability.skills : [];
}

/** Token-boundary skill name match — avoids java ⊆ javascript false positives. */
function skillNameMatch(a, b) {
  const x = String(a || '')
    .toLowerCase()
    .trim();
  const y = String(b || '')
    .toLowerCase()
    .trim();
  if (!x || !y) return false;
  if (x === y) return true;
  const boundaryIncludes = (hay, needle) => {
    if (needle.length < 2) return false;
    let idx = 0;
    while ((idx = hay.indexOf(needle, idx)) !== -1) {
      const before = idx === 0 ? '' : hay[idx - 1];
      const after = idx + needle.length >= hay.length ? '' : hay[idx + needle.length];
      const beforeOk = !before || !/[a-z0-9]/.test(before);
      const afterOk = !after || !/[a-z0-9]/.test(after);
      if (beforeOk && afterOk) return true;
      idx += 1;
    }
    return false;
  };
  return boundaryIncludes(x, y) || boundaryIncludes(y, x);
}

function skillLevelWeight(level) {
  const n = Number(level);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return Math.min(1, Math.max(0.4, n / 5));
}

function averageSkillLevel(skills = []) {
  const levels = skills
    .map((skill) => (typeof skill === 'object' ? Number(skill?.level) : NaN))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!levels.length) return 1;
  return levels.reduce((a, b) => a + b, 0) / levels.length;
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

/**
 * Skill coverage in [0, 0.3]. Prefer canonical id overlap; name fallback only when ids missing.
 */
function skillCoverageContribution(item, needNames, requiredSkillIds = []) {
  const reqIds = canonicalSkillIds(requiredSkillIds);
  const empIds = new Set(canonicalSkillIds(item.skillCanonicalIds || []));
  const skills = skillsFromPoolItem(item);
  const levelW = skillLevelWeight(averageSkillLevel(skills));

  if (reqIds.length && empIds.size) {
    const hits = reqIds.filter((id) => empIds.has(id)).length;
    return 0.3 * (hits / reqIds.length) * levelW;
  }

  if (!needNames.size) return 0;
  const hasNames = skills
    .map((skill) => String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase())
    .filter(Boolean);
  let weighted = 0;
  for (const need of needNames) {
    const matched = skills.find((skill) => {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      return skillNameMatch(name, need);
    });
    if (matched) {
      const lvl =
        typeof matched === 'object' && matched?.level != null
          ? skillLevelWeight(matched.level)
          : levelW;
      weighted += lvl;
    }
  }
  return 0.3 * (weighted / needNames.size);
}

function normalizePoolItemsForMatching(items = []) {
  return items
    .filter((item) => item && item.isActive !== false && (item.userId || item.id))
    .map((item) => {
      let capacityRemaining = Number(item.capacityRemaining ?? item.capacity);
      if (!Number.isFinite(capacityRemaining)) {
        const availablePct = Number(item.availablePct);
        if (Number.isFinite(availablePct)) {
          capacityRemaining = Math.max(0, Math.min(1, availablePct / 100));
        } else {
          const rangePct = Number(
            item.capacityRange?.avgAvailablePct ?? item.capacityRange?.availablePctAvg
          );
          if (Number.isFinite(rangePct)) {
            capacityRemaining = Math.max(0, Math.min(1, rangePct / 100));
          } else {
            capacityRemaining = 1;
          }
        }
      }
      const seniorityBand =
        item.capability?.seniorityBand ||
        item.capability?.seniority ||
        item.seniorityBand ||
        '';
      const seniorityLevel =
        Number(item.seniorityLevel || item.level) ||
        (seniorityBand === 'lead' || seniorityBand === 'principal'
          ? 4
          : seniorityBand === 'senior'
            ? 3
            : 0);
      const primaryDomain = String(
        item.capability?.primaryDomain || item.primaryDomain || ''
      ).trim();
      return {
        userId: String(item.userId || item.id),
        displayName: String(item.displayName || item.fullName || item.name || item.email || ''),
        jobTitle: item.jobTitle || '',
        projectRoleKey: item.projectRoleKey || '',
        inferredRoleKeys: Array.isArray(item.inferredRoleKeys) ? item.inferredRoleKeys : [],
        skills: Array.isArray(item.skills) ? item.skills : item.capability?.skills || [],
        skillCanonicalIds: canonicalSkillIds(
          item.skillCanonicalIds || item.skillsCanonical || []
        ),
        capacityRemaining: Math.max(0, Math.min(1, capacityRemaining)),
        seniorityLevel,
        seniorityBand,
        primaryDomain,
        isActive: item.isActive !== false,
        maxConcurrentProjects:
          item.maxConcurrentProjects ?? item.resourceConfig?.maxConcurrentProjects ?? null,
        activeProjectCount:
          item.activeProjectCount ?? item.activeProjects ?? item.projectCount ?? null,
        resourceConfig: item.resourceConfig || null,
        history: Array.isArray(item.history)
          ? item.history
          : item.capability?.projectExperiences || [],
      };
    });
}

function historyOverlapBonus(item, task, needSkills = new Set()) {
  let roleHit = false;
  let domainHit = false;
  let workHit = false;
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  const primaryDomain = String(item?.primaryDomain || item?.capability?.primaryDomain || '')
    .toLowerCase()
    .trim();
  for (const row of item?.history || []) {
    const historyRole = normalizeRoleKey(row?.role || row?.projectRole);
    roleHit ||= Boolean(roleKey && historyRole && (roleKey.includes(historyRole) || historyRole.includes(roleKey)));
    const domain = String(row?.domain || row?.businessDomain || primaryDomain || '')
      .toLowerCase()
      .trim();
    if (domain) {
      domainHit ||= [...needSkills].some(
        (skill) => domain.includes(skill) || skill.includes(domain)
      );
    }
    const workBlob = String(row?.work || row?.projectName || '')
      .toLowerCase()
      .trim();
    if (workBlob && needSkills.size) {
      workHit ||= [...needSkills].some((skill) => {
        const s = String(skill || '').toLowerCase().trim();
        if (!s || s.length < 2) return false;
        return workBlob.includes(s);
      });
    }
  }
  let bonus = (roleHit ? 0.06 : 0) + (domainHit ? 0.04 : 0);
  if (workHit && bonus < 0.1) bonus = Math.min(0.1, bonus + 0.02);
  return Math.min(0.1, bonus);
}

function isAtProjectCap(item) {
  const max = Number(item?.maxConcurrentProjects ?? item?.resourceConfig?.maxConcurrentProjects);
  const active = Number(item?.activeProjectCount ?? item?.activeProjects ?? item?.projectCount);
  return Number.isFinite(max) && max > 0 && Number.isFinite(active) && active >= max;
}

function availableCapacityHours(item) {
  return Math.round((Number(item?.capacityRemaining) || 0) * HOURS_PER_FTE * 100) / 100;
}

function resolveBookedHoursByUserDay(options = {}) {
  const booked = options.bookedHoursByUserDay;
  if (booked && typeof booked === 'object' && !Array.isArray(booked)) return booked;
  const meeting = options.meetingHoursByUserDay;
  if (meeting && typeof meeting === 'object' && !Array.isArray(meeting)) return meeting;
  return null;
}

function meetingSoftPenalty(item, bookedHoursByUserDay) {
  if (!bookedHoursByUserDay || typeof bookedHoursByUserDay !== 'object') return 0;
  const prefix = `${item.userId}|`;
  let maxBooked = 0;
  for (const [key, hours] of Object.entries(bookedHoursByUserDay)) {
    if (key === item.userId || String(key).startsWith(prefix)) {
      maxBooked = Math.max(maxBooked, Number(hours) || 0);
    }
  }
  if (maxBooked <= 0) return 0;
  if (maxBooked >= 6) return 0.08;
  if (maxBooked >= 3) return 0.04;
  return 0.02;
}

function requiredSkills(container, task) {
  const skills = new Set((container?.planning?.skills || []).map((skill) =>
    String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase()
  ).filter(Boolean));
  for (const id of task?.sourceCapabilityIds || []) {
    const capability = (container?.analyses?.capability?.items || []).find((item) => item.capabilityId === id);
    for (const skill of capability?.requiredSkills || []) {
      const name = String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase();
      if (name) skills.add(name);
    }
  }
  return skills;
}

function blockingRoleKeys(container) {
  const roles = new Set();
  for (const edge of container?.analyses?.dependency?.edges || []) {
    if (!(edge.critical || edge.blocking)) continue;
    if (edge.type === 'external') roles.add('backend_developer');
  }
  return roles;
}

function scorePoolItemForTask({
  item,
  task,
  container,
  blockers = new Set(),
  criticalIds = new Set(),
  meetingHoursByUserDay = null,
  bookedHoursByUserDay = null,
  requiredSkillIds = null,
  planningHints = null,
}) {
  let score = computeFitScore({
    item,
    task,
    container,
    planningHints,
    criticalSkillIds: requiredSkillIds,
  });
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  if (blockers.size && roleKey && blockers.has(roleKey)) score -= 0.05;
  if (criticalIds.has(String(task?.id || ''))) score += 0.08;
  score -= meetingSoftPenalty(
    item,
    resolveBookedHoursByUserDay({ bookedHoursByUserDay, meetingHoursByUserDay })
  );
  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

function buildFteFromPlanning(container) {
  const hours = container?.planning?.effort?.byRole || {};
  const keys = new Set([
    ...(container?.planning?.roles || []).map((role) => normalizeRoleKey(role.roleKey)),
    ...Object.keys(hours).map(normalizeRoleKey),
  ]);
  return [...keys].filter(Boolean).sort().map((roleKey) => ({
    roleKey,
    count: Math.max(1, Math.ceil((Number(hours[roleKey]) || 0) / HOURS_PER_FTE) || 1),
  }));
}

function isOverloaded({ capacityRemaining, availableHours, taskHours }) {
  if (Number(capacityRemaining) < OVERLOAD_CAPACITY_THRESHOLD) return true;
  if (Number.isFinite(taskHours) && taskHours > 0 && availableHours < taskHours) return true;
  return false;
}

function isLeafTask(task) {
  const level = String(task?.level || '').toLowerCase();
  if (level === 'epic' || level === 'feature' || level === 'story') return false;
  return true;
}

async function runEmployeeMatching(
  _pack,
  container,
  {
    poolItems = [],
    shortlistK = SHORTLIST_K,
    constraints = null,
    meetingHoursByUserDay = null,
    bookedHoursByUserDay = null,
    requiredSkillIds = null,
    planningHints = null,
    projectStart = null,
  } = {}
) {
  const excludeIds = new Set(
    (constraints?.excludeEmployeeIds || []).map((id) => String(id)).filter(Boolean)
  );
  const pool = normalizePoolItemsForMatching(poolItems).filter(
    (item) => !excludeIds.has(String(item.userId))
  );
  const bookedMap = resolveBookedHoursByUserDay({
    bookedHoursByUserDay,
    meetingHoursByUserDay,
  });
  const reqSkillIds =
    requiredSkillIds ||
    planningHints?.criticalSkillIds ||
    container?.merged?.requiredSkillIds ||
    container?.filterMeta?.requiredSkillIds ||
    null;
  const criticalIds = new Set((container?.planning?.criticalWorkIds || []).map(String));
  const blockers = blockingRoleKeys(container);
  let filteredProjectCap = 0;
  let overloadCount = 0;
  const reservedHoursByUser = {};
  const startDate =
    projectStart ||
    container?.planning?.completion?.projectStart ||
    container?.overview?.startDate ||
    null;

  const matchTasks = (container?.planning?.tasks || [])
    .filter((task) => task?.id && isLeafTask(task))
    .slice()
    .sort((a, b) => {
      // Critical + heavier work first so reservation / shortlist stays load-aware
      const aCrit = criticalIds.has(String(a.id)) ? 0 : 1;
      const bCrit = criticalIds.has(String(b.id)) ? 0 : 1;
      if (aCrit !== bCrit) return aCrit - bCrit;
      const aH = Number(a.effortHours ?? a.effortSeedHours) || 0;
      const bH = Number(b.effortHours ?? b.effortSeedHours) || 0;
      if (bH !== aH) return bH - aH;
      return String(a.id).localeCompare(String(b.id));
    });

  let recommendations = matchTasks.map((task) => {
    const taskHours = Number(task.effortHours ?? task.effortSeedHours) || 0;
    const scored = [];
    for (const item of pool) {
      if (isAtProjectCap(item)) {
        filteredProjectCap += 1;
        continue;
      }
      const availableHours = availableCapacityHours(item);
      const reserved = Number(reservedHoursByUser[item.userId]) || 0;
      const softOverload = isOverloaded({
        capacityRemaining: item.capacityRemaining,
        availableHours: Math.max(0, availableHours - reserved),
        taskHours,
      });
      if (softOverload) overloadCount += 1;

      const fitScore = scorePoolItemForTask({
        item,
        task,
        container,
        blockers,
        criticalIds,
        bookedHoursByUserDay: bookedMap,
        requiredSkillIds: reqSkillIds,
        planningHints,
      });

      const sim = simulateTaskCapacity({
        userId: item.userId,
        effortHours: taskHours,
        bookedHoursByUserDay: bookedMap,
        startDate,
        reservedHoursByUser,
      });

      const reasons = [];
      if (criticalIds.has(String(task.id))) reasons.push('critical_work');
      if (softOverload) reasons.push('overload');
      for (const r of sim.reasons || []) reasons.push(r);

      const feasible = sim.feasible !== false;
      const displayName = String(item.displayName || '').trim();
      scored.push({
        userId: item.userId,
        fitScore,
        feasible,
        score: feasible ? fitScore : Math.max(0, fitScore - 0.5),
        available_capacity: Math.max(0, Math.round((availableHours - reserved) * 100) / 100),
        reservedHours: reserved,
        overload: Boolean(softOverload),
        reasons: [...new Set(reasons)],
        ...(displayName ? { displayName } : {}),
      });
    }

    // Prefer feasible → higher fit → more remaining capacity → lower reserved → stable id
    scored.sort(
      (a, b) =>
        Number(b.feasible) - Number(a.feasible) ||
        b.score - a.score ||
        (Number(b.available_capacity) || 0) - (Number(a.available_capacity) || 0) ||
        (Number(a.reservedHours) || 0) - (Number(b.reservedHours) || 0) ||
        a.userId.localeCompare(b.userId)
    );
    const shortlist = scored.slice(0, shortlistK);

    // Reserve top feasible for cumulative awareness across tasks
    const topFeasible = shortlist.find((c) => c.feasible);
    if (topFeasible && taskHours > 0) {
      reserveHours(reservedHoursByUser, topFeasible.userId, taskHours);
    }

    return {
      taskId: task.id,
      candidates: shortlist,
      shortlist,
    };
  });

  const owned = assignFeatureOwners({
    tasks: matchTasks,
    recommendations,
  });
  recommendations = owned.recommendations;

  const unassigned = recommendations
    .filter((rec) => {
      const cands = rec.candidates || rec.shortlist || [];
      return !cands.some((c) => c.feasible !== false);
    })
    .map((rec) => rec.taskId);

  const overload = recommendations.flatMap((rec) =>
    (rec.candidates || rec.shortlist || [])
      .filter((c) => c.feasible === false || c.overload)
      .map((c) => ({
        taskId: rec.taskId,
        userId: c.userId,
        reasons: c.reasons || [],
      }))
  );

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    fte: buildFteFromPlanning(container),
    recommendations,
    featureOwners: owned.featureOwners,
    matching: {
      unassigned,
      overload,
    },
    meta: {
      source: pool.length ? 'pool' : 'fte_only',
      llmCalls: 0,
      poolSize: pool.length,
      recommendationCount: recommendations.length,
      filteredProjectCap,
      overloadCount,
      excludedCount: excludeIds.size,
      criticalWorkCount: (container?.planning?.criticalWorkIds || []).length,
      unassignedCount: unassigned.length,
      hasAssignments: false,
      ...(pool.length ? {} : { error: 'empty_pool' }),
    },
  };
}

function applyMatchingToContainer(container, result) {
  return {
    ...container,
    resource: {
      ...(container?.resource || {}),
      fte: result.fte,
      recommendations: result.recommendations,
      featureOwners: result.featureOwners || [],
      matching: {
        ...(container?.resource?.matching || {}),
        ...(result.matching || {}),
        unassigned: result.matching?.unassigned || [],
        overload: result.matching?.overload || [],
      },
      unassigned: result.matching?.unassigned || [],
    },
  };
}

module.exports = {
  SHORTLIST_K,
  HOURS_PER_FTE,
  OVERLOAD_CAPACITY_THRESHOLD,
  buildFteFromPlanning,
  skillsFromPoolItem,
  normalizePoolItemsForMatching,
  historyOverlapBonus,
  isAtProjectCap,
  availableCapacityHours,
  resolveBookedHoursByUserDay,
  meetingSoftPenalty,
  skillNameMatch,
  skillCoverageContribution,
  scorePoolItemForTask,
  blockingRoleKeys,
  requiredSkills,
  runEmployeeMatching,
  applyMatchingToContainer,
};
