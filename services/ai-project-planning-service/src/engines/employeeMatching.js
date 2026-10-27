/**
 * Ported from project-service matching — Fit → Feasible → featureOwner (HARD-02 one path).
 */
const { canonicalizeProjectRoleKey, normalizeRoleKey } = require('./roleKey');
const { computeFitScore, computePolicyRankScore } = require('./matchingFit');
const {
  simulateTaskCapacity,
  reserveHours,
} = require('./matchingCapacitySim');
const { assignFeatureOwners } = require('./featureOwnerAssign');
const { resolveAssignmentPolicy } = require('./assignmentPolicyResolve');
const {
  evaluateHard,
  getCapacityIneligibleReasons,
  isAssignableCandidate,
} = require('./assignmentCriteria');

const SHORTLIST_K = 5;
const HOURS_PER_FTE = 40;
const OVERLOAD_CAPACITY_THRESHOLD = 0.15;
/** Project cap stays exclusive. Role mismatch still ranks lower but keeps a named suggestion. */
const SUGGESTION_BLOCKING_REASONS = new Set(['project_cap']);

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

function collectProjectRoleKeys(item) {
  const raw = [];
  if (Array.isArray(item?.projectRoleKeys)) raw.push(...item.projectRoleKeys);
  if (item?.projectRoleKey) raw.push(item.projectRoleKey);
  const keys = [];
  for (const value of raw) {
    const key = canonicalizeProjectRoleKey(value);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function frIdsForTask(task, taskById) {
  const seen = new Set();
  const ids = [];
  let current = task;
  while (current) {
    const id = String(current.id || current.taskId || '');
    if (id) {
      if (seen.has(id)) break;
      seen.add(id);
    }
    const own = Array.isArray(current.sourceFrIds) ? current.sourceFrIds : [];
    for (const frId of own) {
      const key = String(frId || '').trim();
      if (key && !ids.includes(key)) ids.push(key);
    }
    if (ids.length) break;
    const parentId = String(current.parentStoryId || current.parentId || '').trim();
    current = parentId && taskById ? taskById.get(parentId) : null;
  }
  return ids;
}

function skillIdsForTask(task, frLinks, taskById) {
  const frIds = new Set(frIdsForTask(task, taskById));
  if (!frIds.size) return [];
  const out = [];
  for (const link of frLinks || []) {
    const frId = String(link?.frId || '').trim();
    if (!frId || !frIds.has(frId)) continue;
    for (const skillId of link.skillCanonicalIds || []) {
      const key = String(skillId || '').trim().toUpperCase();
      if (!key || key === 'SK-UNMAPPED' || out.includes(key)) continue;
      out.push(key);
    }
  }
  return out;
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
            // Missing capacity → 0 (do not invent full FTE availability)
            capacityRemaining = 0;
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
        projectRoleKeys: collectProjectRoleKeys(item),
        orgRoleKeys: Array.isArray(item.orgRoleKeys)
          ? item.orgRoleKeys.map((key) => String(key || '').trim()).filter(Boolean)
          : [],
        orgPositionRoleKeys: Array.isArray(item.orgPositionRoleKeys)
          ? item.orgPositionRoleKeys.map((key) => String(key || '').trim()).filter(Boolean)
          : [],
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
        forecastWorkloadPct:
          item.forecastWorkloadPct != null ? Number(item.forecastWorkloadPct) : undefined,
        forecastDemandHours:
          item.forecastDemandHours != null ? Number(item.forecastDemandHours) : undefined,
      };
    });
}

function historyOverlapBonus(item, task, needSkills = new Set()) {
  let roleHit = false;
  let domainHit = false;
  let workHit = false;
  let techHit = false;
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
    const techList = Array.isArray(row?.technologies)
      ? row.technologies
      : Array.isArray(row?.technologiesHandled)
        ? row.technologiesHandled
        : [];
    if (techList.length && needSkills.size) {
      techHit ||= techList.some((tech) => {
        const t = String(tech || '').toLowerCase().trim();
        if (!t || t.length < 2) return false;
        return [...needSkills].some((skill) => {
          const s = String(skill || '').toLowerCase().trim();
          return s && (t.includes(s) || s.includes(t));
        });
      });
    }
  }
  let bonus = (roleHit ? 0.06 : 0) + (domainHit ? 0.04 : 0);
  if (workHit && bonus < 0.1) bonus = Math.min(0.1, bonus + 0.02);
  if (techHit && bonus < 0.1) bonus = Math.min(0.1, bonus + 0.03);
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

function resolveTaskStartDate(task, projectStart, policy) {
  if (policy?.hardGates?.dependencyEarliestStart) {
    const es =
      task?.earliestStart ||
      task?.earliestStartDate ||
      task?.es ||
      task?.startDate ||
      null;
    if (es) return es;
  }
  return projectStart;
}

function bumpHardGateSummary(summary, reasons = []) {
  for (const reason of reasons) {
    if (reason === 'role_mismatch') summary.excludedByRole += 1;
    else if (
      reason === 'soft_overload' ||
      reason === 'capacity_infeasible' ||
      reason === 'forecast_overload' ||
      reason === 'day_overload' ||
      reason === 'cumulative_overload'
    ) {
      summary.excludedByCapacity += 1;
    } else if (reason === 'skill_below_min') summary.excludedBySkill += 1;
    else if (reason === 'project_cap') summary.excludedByProjectCap += 1;
  }
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

/**
 * Demand (effort.byRole) vs supply (pool available hours) — Gate2 Capacity / G13 hard-gate.
 * @param {{ container?: object, pool?: object[], matching?: object, hardGateSummary?: object }} input
 */
function buildCapacityPlan({
  container = {},
  pool = [],
  matching = {},
  hardGateSummary = null,
} = {}) {
  const demandByRole = container?.planning?.effort?.byRole || {};
  const supplyByRole = {};
  for (const item of Array.isArray(pool) ? pool : []) {
    const roleKey = normalizeRoleKey(
      item?.role || item?.jobTitle || item?.membershipRole || ''
    );
    if (!roleKey) continue;
    supplyByRole[roleKey] =
      Math.round(((supplyByRole[roleKey] || 0) + availableCapacityHours(item)) * 100) / 100;
  }
  const roleKeys = new Set([
    ...Object.keys(demandByRole).map(normalizeRoleKey).filter(Boolean),
    ...Object.keys(supplyByRole),
  ]);
  const byRole = [];
  let totalDemandHours = 0;
  let totalSupplyHours = 0;
  let totalGapHours = 0;
  for (const roleKey of [...roleKeys].sort()) {
    const demandHours = Math.round((Number(demandByRole[roleKey]) || 0) * 100) / 100;
    const supplyHours = Math.round((Number(supplyByRole[roleKey]) || 0) * 100) / 100;
    const gapHours = Math.max(0, Math.round((demandHours - supplyHours) * 100) / 100);
    totalDemandHours += demandHours;
    totalSupplyHours += supplyHours;
    totalGapHours += gapHours;
    byRole.push({ roleKey, demandHours, supplyHours, gapHours });
  }
  const unassignedCount = Array.isArray(matching?.unassigned) ? matching.unassigned.length : 0;
  const overloadCount = Array.isArray(matching?.overload) ? matching.overload.length : 0;
  const byPhase =
    container?.planning?.effort?.byPhase && typeof container.planning.effort.byPhase === 'object'
      ? { ...container.planning.effort.byPhase }
      : null;
  return {
    byRole,
    byPhase,
    totalDemandHours: Math.round(totalDemandHours * 100) / 100,
    totalSupplyHours: Math.round(totalSupplyHours * 100) / 100,
    totalGapHours: Math.round(totalGapHours * 100) / 100,
    unassignedCount,
    overloadCount,
    hardGateSummary: hardGateSummary || null,
    /** Hard-gate: gap or unassigned/overload — G13 resourceOk must fail when matching ran */
    hardGate: totalGapHours > 0 || unassignedCount > 0 || overloadCount > 0,
  };
}

function isOverloaded({ capacityRemaining, availableHours, taskHours }) {
  if (Number(capacityRemaining) < OVERLOAD_CAPACITY_THRESHOLD) return true;
  if (Number.isFinite(taskHours) && taskHours > 0 && availableHours < taskHours) return true;
  return false;
}

function isLeafTask(task) {
  const level = String(task?.level || '').toLowerCase();
  return level === 'task' || level === 'subtask';
}

async function runEmployeeMatching(
  pack,
  container,
  {
    poolItems = [],
    shortlistK = SHORTLIST_K,
    constraints = null,
    meetingHoursByUserDay = null,
    bookedHoursByUserDay = null,
    requiredSkillIds = null,
    frLinks = [],
    planningHints = null,
    projectStart = null,
    project = null,
    org = null,
    env = process.env,
  } = {}
) {
  const resolved = resolveAssignmentPolicy({
    pack,
    project,
    org,
    planningHints,
    env,
  });
  const policyEnabled = resolved.enabled;
  const policy = resolved.policy;
  const effectiveShortlistK = policyEnabled
    ? policy.globalAssign.shortlistK
    : shortlistK || SHORTLIST_K;

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
  const hardGateSummary = {
    excludedByRole: 0,
    excludedByCapacity: 0,
    excludedBySkill: 0,
    excludedByProjectCap: 0,
  };
  const reservedHoursByUser = {};
  const projectStartDate =
    projectStart ||
    container?.planning?.completion?.projectStart ||
    container?.overview?.startDate ||
    null;

  const matchTasks = (container?.planning?.tasks || [])
    .filter((task) => task?.id && isLeafTask(task))
    .slice()
    .sort((a, b) => {
      const aCrit = criticalIds.has(String(a.id)) ? 0 : 1;
      const bCrit = criticalIds.has(String(b.id)) ? 0 : 1;
      if (aCrit !== bCrit) return aCrit - bCrit;
      const aH = Number(a.effortHours ?? a.effortSeedHours) || 0;
      const bH = Number(b.effortHours ?? b.effortSeedHours) || 0;
      if (bH !== aH) return bH - aH;
      return String(a.id).localeCompare(String(b.id));
    });
  const taskById = new Map(
    (container?.planning?.tasks || []).map((task) => [String(task.id || task.taskId), task])
  );

  let recommendations = matchTasks.map((task) => {
    const taskHours = Number(task.effortHours ?? task.effortSeedHours) || 0;
    const startDate = resolveTaskStartDate(task, projectStartDate, policyEnabled ? policy : null);
    const taskSkillIds = skillIdsForTask(task, frLinks, taskById);
    const skillIdsForRank = taskSkillIds.length ? taskSkillIds : reqSkillIds || [];
    const scored = [];
    const ineligible = [];

    for (const item of pool) {
      const availableHours = availableCapacityHours(item);
      const reserved = Number(reservedHoursByUser[item.userId]) || 0;
      const availAfterReserve = Math.max(0, availableHours - reserved);
      const displayName = String(item.displayName || '').trim();
      const forecastPct = Number(item.forecastWorkloadPct);

      if (policyEnabled) {
        if (policy.hardGates.respectProjectCap && isAtProjectCap(item)) {
          filteredProjectCap += 1;
          hardGateSummary.excludedByProjectCap += 1;
          ineligible.push({
            userId: item.userId,
            reasons: ['project_cap'],
            ...(displayName ? { displayName } : {}),
          });
          continue;
        }

        const hard = evaluateHard(
          {
            item,
            task,
            container,
            requiredSkillIds: skillIdsForRank,
            domainTokens: planningHints?.domainTokens || [],
            taskHours,
            availableHours: availAfterReserve,
            reservedHours: reserved,
            bookedHoursByUserDay: bookedMap,
            startDate,
            reservedHoursByUser,
          },
          {
            ...policy.hardGates,
            // project_cap already handled above to match legacy counter
            respectProjectCap: false,
          }
        );

        let suggestDespiteGate = false;
        const gateReasons = hard.pass ? [] : hard.reasons;
        if (!hard.pass) {
          if (hard.reasons.includes('soft_overload')) overloadCount += 1;
          bumpHardGateSummary(hardGateSummary, hard.reasons);
          const capacityReasons = getCapacityIneligibleReasons(hard);
          const blocking =
            capacityReasons.length > 0 ||
            hard.reasons.some((reason) => SUGGESTION_BLOCKING_REASONS.has(reason));
          if (blocking) {
            ineligible.push({
              userId: item.userId,
              reasons: capacityReasons.length ? capacityReasons : hard.reasons,
              skillCoverage: hard.skillCoverage,
              ...(displayName ? { displayName } : {}),
            });
            continue;
          }
          suggestDespiteGate = true;
        }

        const ranked = computePolicyRankScore({
          item,
          task,
          container,
          policy,
          criticalSkillIds: skillIdsForRank,
          domainTokens: planningHints?.domainTokens || [],
          taskHours,
          availableHours: availAfterReserve,
          reservedHours: reserved,
          planningHints,
        });

        let fitScore = ranked.score;
        const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
        if (blockers.size && roleKey && blockers.has(roleKey)) {
          fitScore = Math.max(0, fitScore - 0.05);
        }
        if (criticalIds.has(String(task.id))) {
          fitScore = Math.min(1, fitScore + 0.08);
        }
        fitScore = Math.max(0, Math.min(1, Math.round(fitScore * 1000) / 1000));

        const reasons = [];
        if (criticalIds.has(String(task.id))) reasons.push('critical_work');
        for (const reason of gateReasons) {
          if (!reasons.includes(reason)) reasons.push(reason);
        }
        if (suggestDespiteGate && reasons.includes('skill_below_min')) {
          fitScore = Math.max(0, Math.round((fitScore - 0.15) * 1000) / 1000);
        }
        scored.push({
          userId: item.userId,
          fitScore,
          feasible: true,
          eligible: true,
          score: fitScore,
          available_capacity: Math.round(availAfterReserve * 100) / 100,
          reservedHours: reserved,
          overload: false,
          forecastWorkloadPct: Number.isFinite(forecastPct) ? forecastPct : undefined,
          reasons,
          rankBreakdown: ranked.breakdown,
          ...(displayName ? { displayName } : {}),
        });
        continue;
      }

      // ——— Legacy path (ASSIGNMENT_POLICY_V1=0) ———
      if (isAtProjectCap(item)) {
        filteredProjectCap += 1;
        continue;
      }
      const softOverload = isOverloaded({
        capacityRemaining: item.capacityRemaining,
        availableHours: availAfterReserve,
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
        requiredSkillIds: skillIdsForRank,
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

      let forecastOverload = false;
      if (Number.isFinite(forecastPct) && taskHours > 0) {
        const reservedPct = (reserved / HOURS_PER_FTE) * 100;
        const addPct = (taskHours / HOURS_PER_FTE) * 100;
        if (forecastPct + reservedPct + addPct > 100) {
          forecastOverload = true;
          reasons.push('forecast_overload');
        }
      } else if (
        Number.isFinite(availableHours) &&
        taskHours > 0 &&
        availAfterReserve < taskHours &&
        item.forecastDemandHours != null
      ) {
        forecastOverload = true;
        reasons.push('forecast_overload');
      }

      const feasible = sim.feasible !== false && !forecastOverload;
      scored.push({
        userId: item.userId,
        fitScore,
        feasible,
        score: feasible ? fitScore : Math.max(0, fitScore - 0.5),
        available_capacity: Math.round(availAfterReserve * 100) / 100,
        reservedHours: reserved,
        overload: Boolean(softOverload || forecastOverload),
        forecastWorkloadPct: Number.isFinite(forecastPct) ? forecastPct : undefined,
        reasons: [...new Set(reasons)],
        ...(displayName ? { displayName } : {}),
      });
    }

    if (policyEnabled) {
      scored.sort(
        (a, b) =>
          b.score - a.score ||
          (Number(b.available_capacity) || 0) - (Number(a.available_capacity) || 0) ||
          (Number(a.reservedHours) || 0) - (Number(b.reservedHours) || 0) ||
          a.userId.localeCompare(b.userId)
      );
    } else {
      scored.sort(
        (a, b) =>
          Number(b.feasible) - Number(a.feasible) ||
          b.score - a.score ||
          (Number(b.available_capacity) || 0) - (Number(a.available_capacity) || 0) ||
          (Number(a.reservedHours) || 0) - (Number(b.reservedHours) || 0) ||
          a.userId.localeCompare(b.userId)
      );
    }

    const shortlist = scored.filter(isAssignableCandidate).slice(0, effectiveShortlistK);
    const topFeasible = shortlist.find((c) => c.feasible !== false);
    if (topFeasible && taskHours > 0) {
      reserveHours(reservedHoursByUser, topFeasible.userId, taskHours);
    }

    return {
      taskId: task.id,
      candidates: shortlist,
      shortlist,
      ...(policyEnabled && ineligible.length ? { ineligible: ineligible.slice(0, 20) } : {}),
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

  const assignmentPolicyMeta = policyEnabled
    ? {
        profileId: resolved.meta.profileId,
        version: resolved.meta.version,
        hardGateSummary: { ...hardGateSummary },
        sourceLayers: resolved.meta.sourceLayers,
      }
    : undefined;

  const matching = {
    unassigned,
    overload,
    ...(assignmentPolicyMeta ? { assignmentPolicy: assignmentPolicyMeta } : {}),
  };
  const capacityPlan = buildCapacityPlan({
    container,
    pool,
    matching,
    hardGateSummary: policyEnabled ? { ...hardGateSummary } : null,
  });

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    fte: buildFteFromPlanning(container),
    recommendations,
    featureOwners: owned.featureOwners,
    matching,
    capacityPlan,
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
      policyEnabled,
      capacityHardGate: Boolean(capacityPlan.hardGate),
      totalGapHours: capacityPlan.totalGapHours,
      ...(assignmentPolicyMeta ? { assignmentPolicy: assignmentPolicyMeta } : {}),
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
        ...(result.matching?.assignmentPolicy
          ? { assignmentPolicy: result.matching.assignmentPolicy }
          : {}),
      },
      unassigned: result.matching?.unassigned || [],
      capacityPlan: result.capacityPlan || null,
    },
  };
}

module.exports = {
  SHORTLIST_K,
  HOURS_PER_FTE,
  OVERLOAD_CAPACITY_THRESHOLD,
  buildFteFromPlanning,
  buildCapacityPlan,
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
