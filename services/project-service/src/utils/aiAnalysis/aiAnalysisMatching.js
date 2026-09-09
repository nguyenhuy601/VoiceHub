/**
 * Job5 Employee Matching (W7) — resource.fte + recommendations shortlist.
 * No assignments. Gap not used for matching people.
 */

const { normalizeRoleKey } = require('../requirement/requirementStaffingParse');

const SHORTLIST_K = 5;
const HOURS_PER_FTE = 40;

function buildFteFromPlanning(container) {
  const roles = container?.planning?.roles || [];
  const effort = container?.planning?.effort;
  const byRoleHours =
    effort?.byRole && typeof effort.byRole === 'object' ? effort.byRole : {};

  const fteMap = new Map();
  for (const r of roles) {
    const roleKey = normalizeRoleKey(r.roleKey);
    if (!roleKey) continue;
    const hours = Number(byRoleHours[roleKey]) || 0;
    const count = Math.max(1, Math.ceil(hours / HOURS_PER_FTE) || 1);
    fteMap.set(roleKey, { roleKey, count });
  }
  // Ensure every role with hours appears
  for (const [roleKey, hours] of Object.entries(byRoleHours)) {
    const key = normalizeRoleKey(roleKey);
    if (!key || fteMap.has(key)) continue;
    fteMap.set(key, {
      roleKey: key,
      count: Math.max(1, Math.ceil(Number(hours) / HOURS_PER_FTE) || 1),
    });
  }
  return [...fteMap.values()].sort((a, b) => a.roleKey.localeCompare(b.roleKey));
}

function skillNamesFromContainer(container, task) {
  const names = new Set();
  for (const sk of container?.planning?.skills || []) {
    if (sk?.name) names.add(String(sk.name).toLowerCase());
  }
  for (const capId of task.sourceCapabilityIds || []) {
    const cap = (container?.analyses?.capability?.items || []).find(
      (c) => c.capabilityId === capId
    );
    for (const sk of cap?.requiredSkills || []) {
      const n = typeof sk === 'string' ? sk : sk.name;
      if (n) names.add(String(n).toLowerCase());
    }
  }
  return names;
}

function skillsFromPoolItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) return item.skills;
  const capSkills = item?.capability?.skills;
  if (Array.isArray(capSkills)) return capSkills;
  return [];
}

/**
 * Map org resource pool rows → matching scorer shape.
 */
function normalizePoolItemsForMatching(items = []) {
  const out = [];
  for (const raw of items || []) {
    if (!raw || typeof raw !== 'object') continue;
    if (raw.isActive === false) continue;
    const userId = String(raw.userId || raw.id || '').trim();
    if (!userId) continue;

    let capacityRemaining = Number(raw.capacityRemaining ?? raw.capacity);
    if (!Number.isFinite(capacityRemaining)) {
      const pct = Number(raw.availablePct);
      if (Number.isFinite(pct)) capacityRemaining = Math.max(0, Math.min(1, pct / 100));
      else if (raw.capacityRange && Number.isFinite(Number(raw.capacityRange.availablePctAvg))) {
        capacityRemaining = Math.max(
          0,
          Math.min(1, Number(raw.capacityRange.availablePctAvg) / 100)
        );
      } else {
        capacityRemaining = 1;
      }
    }

    const seniorityBand = raw.capability?.seniorityBand || raw.seniorityBand || '';
    const seniorityLevel =
      Number(raw.seniorityLevel || raw.level) ||
      (seniorityBand === 'lead' || seniorityBand === 'principal'
        ? 4
        : seniorityBand === 'senior'
          ? 3
          : 0);

    out.push({
      userId,
      displayName: String(
        raw.displayName || raw.fullName || raw.name || raw.email || ''
      ).trim(),
      jobTitle: raw.jobTitle || '',
      projectRoleKey: raw.projectRoleKey || '',
      inferredRoleKeys: Array.isArray(raw.inferredRoleKeys) ? raw.inferredRoleKeys : [],
      skills: skillsFromPoolItem(raw),
      capacityRemaining,
      seniorityLevel,
      isActive: raw.isActive !== false,
      maxConcurrentProjects:
        raw.maxConcurrentProjects ?? raw.resourceConfig?.maxConcurrentProjects ?? null,
      activeProjectCount:
        raw.activeProjectCount ?? raw.activeProjects ?? raw.projectCount ?? null,
      resourceConfig: raw.resourceConfig || null,
    });
  }
  return out;
}

function isAtProjectCap(item) {
  const max = Number(
    item?.maxConcurrentProjects ?? item?.resourceConfig?.maxConcurrentProjects
  );
  if (!Number.isFinite(max) || max <= 0) return false;
  const active = Number(
    item?.activeProjectCount ?? item?.activeProjects ?? item?.projectCount
  );
  if (!Number.isFinite(active)) return false;
  return active >= max;
}

function scorePoolItemForTask({ item, task, container, blockers, criticalIds }) {
  let score = 0.2;
  const roleKey = normalizeRoleKey(task.suggestedRoleKey);
  const itemRoles = [
    normalizeRoleKey(item.projectRoleKey),
    normalizeRoleKey(item.jobTitle),
    ...(Array.isArray(item.inferredRoleKeys) ? item.inferredRoleKeys.map(normalizeRoleKey) : []),
  ].filter(Boolean);

  if (roleKey && itemRoles.some((r) => r.includes(roleKey) || roleKey.includes(r))) {
    score += 0.35;
  }

  const needSkills = skillNamesFromContainer(container, task);
  const have = new Set(
    skillsFromPoolItem(item).map((s) =>
      String(typeof s === 'string' ? s : s.name || '')
        .toLowerCase()
        .trim()
    )
  );
  let skillHits = 0;
  for (const s of needSkills) {
    if (have.has(s) || [...have].some((h) => h.includes(s) || s.includes(h))) {
      skillHits += 1;
    }
  }
  if (needSkills.size) {
    score += 0.3 * (skillHits / needSkills.size);
  }

  const capacity = Number(item.capacityRemaining ?? item.capacity ?? 1);
  if (Number.isFinite(capacity)) {
    score += Math.max(0, Math.min(0.2, capacity * 0.2));
  }

  const complexity = (task.sourceCapabilityIds || [])
    .map((id) =>
      (container?.analyses?.capability?.items || []).find((c) => c.capabilityId === id)
    )
    .find((c) => c)?.complexity;
  if (complexity === 'high' && Number(item.seniorityLevel || item.level || 0) >= 4) {
    score += 0.1;
  }

  // Risk buffer soft penalty — still include in shortlist
  const criticalRisks = (container?.analyses?.risk?.items || []).filter(
    (r) => r.band === 'critical' || r.band === 'high'
  ).length;
  if (criticalRisks > 3) score -= 0.05;

  if (blockers && blockers.size && roleKey && blockers.has(roleKey)) {
    score -= 0.05;
  }

  if (criticalIds && criticalIds.has(String(task.id || ''))) {
    score += 0.08;
  }

  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

function blockingRoleKeys(container) {
  const set = new Set();
  for (const e of container?.analyses?.dependency?.edges || []) {
    if (!(e.critical || e.blocking)) continue;
    // soft: mark backend when external blockers
    if (e.type === 'external') set.add('backend_developer');
  }
  return set;
}

/**
 * @param {object} container
 * @param {object[]} poolItems — slim { userId, jobTitle?, skills?, capacityRemaining? }
 */
function buildTaskShortlists(container, poolItems = [], { shortlistK = SHORTLIST_K } = {}) {
  const tasks = (container?.planning?.tasks || []).filter((t) => t?.id);
  const blockers = blockingRoleKeys(container);
  const criticalIds = new Set(
    (container?.planning?.criticalWorkIds || []).map((id) => String(id))
  );
  const recommendations = [];
  const normalized = normalizePoolItemsForMatching(poolItems);
  let filteredProjectCap = 0;

  for (const task of tasks) {
    const scored = normalized
      .map((item) => {
        const userId = String(item.userId || '').trim();
        if (!userId) return null;
        if (isAtProjectCap(item)) {
          filteredProjectCap += 1;
          return null;
        }
        const score = scorePoolItemForTask({
          item,
          task,
          container,
          blockers,
          criticalIds,
        });
        const displayName = String(item.displayName || '').trim();
        const reasons = [];
        if (criticalIds.has(String(task.id))) reasons.push('critical_work');
        return {
          userId,
          score,
          ...(displayName ? { displayName } : {}),
          ...(reasons.length ? { reasons } : {}),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId))
      .slice(0, shortlistK);

    recommendations.push({
      taskId: task.id,
      shortlist: scored,
    });
  }
  return { recommendations, filteredProjectCap };
}

async function runEmployeeMatching(pack, container, opts = {}) {
  const poolItems = normalizePoolItemsForMatching(opts.poolItems || []);
  const fte = buildFteFromPlanning(container);
  const { recommendations, filteredProjectCap } = buildTaskShortlists(
    container,
    poolItems,
    { shortlistK: opts.shortlistK || SHORTLIST_K }
  );
  const emptyPool = poolItems.length === 0;

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    fte,
    recommendations,
    meta: {
      source: emptyPool ? 'fte_only' : 'pool',
      llmCalls: 0,
      poolSize: poolItems.length,
      recommendationCount: recommendations.length,
      filteredProjectCap,
      criticalWorkCount: (container?.planning?.criticalWorkIds || []).length,
      hasAssignments: false,
      ...(emptyPool ? { error: 'empty_pool' } : {}),
    },
  };
}

function applyMatchingToContainer(container, matchResult) {
  const next = {
    ...container,
    resource: { ...container.resource },
  };
  next.resource.fte = matchResult.fte || [];
  next.resource.recommendations = matchResult.recommendations || [];
  // Never write assignments in Job5
  return next;
}

module.exports = {
  SHORTLIST_K,
  HOURS_PER_FTE,
  buildFteFromPlanning,
  skillsFromPoolItem,
  normalizePoolItemsForMatching,
  scorePoolItemForTask,
  isAtProjectCap,
  buildTaskShortlists,
  runEmployeeMatching,
  applyMatchingToContainer,
};
