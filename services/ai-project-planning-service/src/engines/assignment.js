/**
 * Deterministic subset ported from
 * project-service/src/utils/aiAnalysis/aiAnalysisAssignment.js.
 * Skips feasible===false; respects cumulative; prefers feature owner.
 * Load-balances by hours then task count; assigns critical-path work first.
 */
const RATIONALE_MAX = 160;
const HOURS_PER_FTE = 40;

function truncate(raw, max) {
  const value = String(raw || '').trim().replace(/\s+/g, ' ');
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function candidatesOf(recommendation) {
  if (Array.isArray(recommendation?.candidates) && recommendation.candidates.length) {
    return recommendation.candidates;
  }
  return Array.isArray(recommendation?.shortlist) ? recommendation.shortlist : [];
}

function shortlistMapFromRecommendations(recommendations = []) {
  const map = new Map();
  for (const recommendation of recommendations) {
    const taskId = String(recommendation.taskId || '').trim();
    if (!taskId) continue;
    const allowed = new Map();
    for (const candidate of candidatesOf(recommendation)) {
      const userId = String(candidate.userId || '').trim();
      if (!userId) continue;
      if (candidate.feasible === false) continue;
      allowed.set(userId, {
        score: Number(candidate.score ?? candidate.fitScore) || 0,
        displayName: String(candidate.displayName || '').trim(),
        feasible: candidate.feasible !== false,
      });
    }
    map.set(taskId, allowed);
  }
  return map;
}

function normalizeAssignment(raw, shortlistByTask, { capacityUsed = new Map() } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const taskId = String(raw.taskId || raw.id || '').trim();
  const userId = String(raw.userId || raw.pickedUserId || '').trim();
  if (!taskId || !userId) return null;
  const allowed = shortlistByTask.get(taskId);
  if (!allowed || !allowed.has(userId)) return null;
  const meta = allowed.get(userId) || {};
  const rationale = truncate(raw.rationale || raw.reason || '', RATIONALE_MAX) || undefined;
  capacityUsed.set(userId, (capacityUsed.get(userId) || 0) + 1);
  const displayName = String(raw.displayName || meta.displayName || '').trim();
  return {
    taskId,
    userId,
    ...(displayName ? { displayName } : {}),
    ...(rationale ? { rationale } : {}),
  };
}

function taskHoursFromContainer(tasks, taskId) {
  const task = (tasks || []).find((t) => String(t.id || t.taskId) === String(taskId));
  return Math.max(0, Number(task?.effortHours ?? task?.effortSeedHours) || 0);
}

function buildCriticalIdSet(tasks = [], criticalWorkIds = []) {
  const ids = new Set((criticalWorkIds || []).map(String).filter(Boolean));
  for (const task of tasks || []) {
    const id = String(task?.id || task?.taskId || '');
    if (!id) continue;
    if (task.critical === true || task.isCritical === true) ids.add(id);
    if (Number(task.totalFloat) === 0 && task.totalFloat != null) ids.add(id);
  }
  return ids;
}

function greedyAssignFromShortlists(
  recommendations = [],
  {
    maxTasksPerUser = 8,
    tasks = [],
    featureOwners = [],
    maxHoursPerUser = HOURS_PER_FTE * 2,
    criticalWorkIds = [],
  } = {}
) {
  const usage = new Map();
  const hoursUsed = new Map();
  const ownerByFeature = new Map(
    (featureOwners || []).map((o) => [String(o.featureId), String(o.ownerUserId)])
  );
  const taskById = new Map((tasks || []).map((t) => [String(t.id || t.taskId), t]));
  const criticalIds = buildCriticalIdSet(tasks, criticalWorkIds);
  const assignments = [];

  const ordered = [...recommendations].sort((a, b) => {
    const aCrit = criticalIds.has(String(a.taskId)) ? 0 : 1;
    const bCrit = criticalIds.has(String(b.taskId)) ? 0 : 1;
    if (aCrit !== bCrit) return aCrit - bCrit;
    const aH = taskHoursFromContainer(tasks, a.taskId);
    const bH = taskHoursFromContainer(tasks, b.taskId);
    if (bH !== aH) return bH - aH;
    return String(a.taskId).localeCompare(String(b.taskId));
  });

  for (const recommendation of ordered) {
    const task = taskById.get(String(recommendation.taskId));
    const featureId = String(task?.featureId || '').trim();
    const preferredOwner = featureId ? ownerByFeature.get(featureId) : null;
    const preferredFromRec = recommendation.preferredOwnerUserId || preferredOwner;
    const taskHours = taskHoursFromContainer(tasks, recommendation.taskId);

    const candidates = [...candidatesOf(recommendation)]
      .filter((candidate) => candidate?.userId && candidate.feasible !== false)
      .sort((a, b) => {
        const aOwner = preferredFromRec && String(a.userId) === String(preferredFromRec) ? 1 : 0;
        const bOwner = preferredFromRec && String(b.userId) === String(preferredFromRec) ? 1 : 0;
        if (bOwner !== aOwner) return bOwner - aOwner;
        // Prefer lighter hour load, then fewer tasks, then higher fit
        const hoursDiff = (hoursUsed.get(a.userId) || 0) - (hoursUsed.get(b.userId) || 0);
        if (hoursDiff) return hoursDiff;
        const loadDiff = (usage.get(a.userId) || 0) - (usage.get(b.userId) || 0);
        if (loadDiff) return loadDiff;
        const availDiff =
          (Number(b.available_capacity) || 0) - (Number(a.available_capacity) || 0);
        if (availDiff) return availDiff;
        return (
          Number(b.score ?? b.fitScore ?? 0) - Number(a.score ?? a.fitScore ?? 0)
        );
      });

    const candidate = candidates.find((item) => {
      if ((usage.get(item.userId) || 0) >= maxTasksPerUser) return false;
      const usedH = hoursUsed.get(item.userId) || 0;
      if (taskHours > 0 && usedH + taskHours > maxHoursPerUser) return false;
      return true;
    });
    if (!candidate) continue;
    usage.set(candidate.userId, (usage.get(candidate.userId) || 0) + 1);
    hoursUsed.set(candidate.userId, (hoursUsed.get(candidate.userId) || 0) + taskHours);
    assignments.push({
      taskId: recommendation.taskId,
      userId: candidate.userId,
      ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
      rationale: `greedy score=${Number(candidate.score ?? candidate.fitScore) || 0}`,
    });
  }
  return assignments;
}

function validateAssignmentsAgainstShortlist(assignments, recommendations) {
  const shortlistByTask = shortlistMapFromRecommendations(recommendations);
  const valid = [];
  const rejected = [];
  for (const assignment of assignments || []) {
    const normalized = normalizeAssignment(assignment, shortlistByTask);
    if (normalized) valid.push(normalized);
    else {
      rejected.push({
        taskId: assignment?.taskId,
        userId: assignment?.userId,
        reason: 'not_in_shortlist',
      });
    }
  }
  return { valid, rejected };
}

function applyAssignmentToContainer(container, result) {
  return {
    ...container,
    resource: {
      ...container.resource,
      assignments: result.assignments || [],
      assignmentsMeta:
        result.meta && typeof result.meta === 'object' ? result.meta : {},
    },
  };
}

module.exports = {
  shortlistMapFromRecommendations,
  normalizeAssignment,
  greedyAssignFromShortlists,
  validateAssignmentsAgainstShortlist,
  applyAssignmentToContainer,
  candidatesOf,
  buildCriticalIdSet,
};
