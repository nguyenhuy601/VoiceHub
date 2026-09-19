/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisMatching.js.
 */
const { normalizeRoleKey } = require('./roleKey');

const SHORTLIST_K = 5;
const HOURS_PER_FTE = 40;

function skillsFromPoolItem(item) {
  if (Array.isArray(item?.skills) && item.skills.length) return item.skills;
  return Array.isArray(item?.capability?.skills) ? item.capability.skills : [];
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
        } else if (
          item.capacityRange &&
          Number.isFinite(Number(item.capacityRange.availablePctAvg))
        ) {
          capacityRemaining = Math.max(
            0,
            Math.min(1, Number(item.capacityRange.availablePctAvg) / 100)
          );
        } else {
          capacityRemaining = 1;
        }
      }
      const seniorityBand = item.capability?.seniorityBand || item.seniorityBand || '';
      const seniorityLevel =
        Number(item.seniorityLevel || item.level) ||
        (seniorityBand === 'lead' || seniorityBand === 'principal'
          ? 4
          : seniorityBand === 'senior'
            ? 3
            : 0);
      return {
        userId: String(item.userId || item.id),
        displayName: String(item.displayName || item.fullName || item.name || item.email || ''),
        jobTitle: item.jobTitle || '',
        projectRoleKey: item.projectRoleKey || '',
        inferredRoleKeys: Array.isArray(item.inferredRoleKeys) ? item.inferredRoleKeys : [],
        skills: Array.isArray(item.skills) ? item.skills : item.capability?.skills || [],
        capacityRemaining: Math.max(0, Math.min(1, capacityRemaining)),
        seniorityLevel,
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
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  for (const row of item?.history || []) {
    const historyRole = normalizeRoleKey(row?.role || row?.projectRole);
    roleHit ||= Boolean(roleKey && historyRole && (roleKey.includes(historyRole) || historyRole.includes(roleKey)));
    const domain = String(row?.domain || row?.businessDomain || '')
      .toLowerCase()
      .trim();
    if (domain) {
      domainHit ||= [...needSkills].some(
        (skill) => domain.includes(skill) || skill.includes(domain)
      );
    }
  }
  return Math.min(0.1, (roleHit ? 0.06 : 0) + (domainHit ? 0.04 : 0));
}

function isAtProjectCap(item) {
  const max = Number(item?.maxConcurrentProjects ?? item?.resourceConfig?.maxConcurrentProjects);
  const active = Number(item?.activeProjectCount ?? item?.activeProjects ?? item?.projectCount);
  return Number.isFinite(max) && max > 0 && Number.isFinite(active) && active >= max;
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
}) {
  let score = 0.2;
  const roleKey = normalizeRoleKey(task?.suggestedRoleKey);
  const itemRoles = [item.projectRoleKey, item.jobTitle, ...(item.inferredRoleKeys || [])]
    .map(normalizeRoleKey)
    .filter(Boolean);
  if (roleKey && itemRoles.some((role) => role.includes(roleKey) || roleKey.includes(role))) score += 0.35;
  const needs = requiredSkills(container, task);
  const has = new Set((item.skills || []).map((skill) =>
    String(typeof skill === 'string' ? skill : skill?.name || '').toLowerCase()
  ).filter(Boolean));
  const hits = [...needs].filter((need) => [...has].some((skill) => skill.includes(need) || need.includes(skill))).length;
  if (needs.size) score += 0.3 * hits / needs.size;
  score += 0.2 * Math.max(0, Math.min(1, Number(item.capacityRemaining) || 0));
  const complexity = (task.sourceCapabilityIds || [])
    .map((id) =>
      (container?.analyses?.capability?.items || []).find(
        (capability) => capability.capabilityId === id
      )
    )
    .find(Boolean)?.complexity;
  if (complexity === 'high' && Number(item.seniorityLevel || item.level || 0) >= 4) {
    score += 0.1;
  }
  const criticalRiskCount = (container?.analyses?.risk?.items || []).filter(
    (risk) => risk.band === 'critical' || risk.band === 'high'
  ).length;
  if (criticalRiskCount > 3) score -= 0.05;
  if (blockers.size && roleKey && blockers.has(roleKey)) score -= 0.05;
  if (criticalIds.has(String(task?.id || ''))) score += 0.08;
  score += historyOverlapBonus(item, task, needs);
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

async function runEmployeeMatching(_pack, container, { poolItems = [], shortlistK = SHORTLIST_K } = {}) {
  const pool = normalizePoolItemsForMatching(poolItems);
  const criticalIds = new Set((container?.planning?.criticalWorkIds || []).map(String));
  const blockers = blockingRoleKeys(container);
  let filteredProjectCap = 0;
  const recommendations = (container?.planning?.tasks || []).filter((task) => task?.id).map((task) => ({
    taskId: task.id,
    shortlist: pool.map((item) => {
      if (isAtProjectCap(item)) {
        filteredProjectCap += 1;
        return null;
      }
      const reasons = [];
      if (criticalIds.has(String(task.id))) reasons.push('critical_work');
      const displayName = String(item.displayName || '').trim();
      return {
        userId: item.userId,
        score: scorePoolItemForTask({ item, task, container, blockers, criticalIds }),
        ...(displayName ? { displayName } : {}),
        ...(reasons.length ? { reasons } : {}),
      };
    }).filter(Boolean).sort((a, b) => b.score - a.score || a.userId.localeCompare(b.userId)).slice(0, shortlistK),
  }));
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    fte: buildFteFromPlanning(container),
    recommendations,
    meta: {
      source: pool.length ? 'pool' : 'fte_only',
      llmCalls: 0,
      poolSize: pool.length,
      recommendationCount: recommendations.length,
      filteredProjectCap,
      criticalWorkCount: (container?.planning?.criticalWorkIds || []).length,
      hasAssignments: false,
      ...(pool.length ? {} : { error: 'empty_pool' }),
    },
  };
}

function applyMatchingToContainer(container, result) {
  return {
    ...container,
    resource: { ...(container?.resource || {}), fte: result.fte, recommendations: result.recommendations },
  };
}

module.exports = {
  SHORTLIST_K,
  HOURS_PER_FTE,
  buildFteFromPlanning,
  skillsFromPoolItem,
  normalizePoolItemsForMatching,
  historyOverlapBonus,
  isAtProjectCap,
  scorePoolItemForTask,
  blockingRoleKeys,
  runEmployeeMatching,
  applyMatchingToContainer,
};
