/**
 * Deterministic subset ported from
 * project-service/src/utils/aiAnalysis/aiAnalysisAssignment.js.
 * Remote scheduleCapacity intentionally uses the legacy force-heuristic path.
 */
const RATIONALE_MAX = 160;

function truncate(raw, max) {
  const value = String(raw || '').trim().replace(/\s+/g, ' ');
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}

function shortlistMapFromRecommendations(recommendations = []) {
  const map = new Map();
  for (const recommendation of recommendations) {
    const taskId = String(recommendation.taskId || '').trim();
    if (!taskId) continue;
    const allowed = new Map();
    for (const candidate of recommendation.shortlist || []) {
      const userId = String(candidate.userId || '').trim();
      if (!userId) continue;
      allowed.set(userId, {
        score: Number(candidate.score) || 0,
        displayName: String(candidate.displayName || '').trim(),
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

function greedyAssignFromShortlists(recommendations = [], { maxTasksPerUser = 8 } = {}) {
  const usage = new Map();
  const assignments = [];
  for (const recommendation of [...recommendations].sort((a, b) =>
    String(a.taskId).localeCompare(String(b.taskId))
  )) {
    const candidates = [...(recommendation.shortlist || [])]
      .filter((candidate) => candidate?.userId)
      .sort((a, b) => {
        const loadDiff = (usage.get(a.userId) || 0) - (usage.get(b.userId) || 0);
        return loadDiff || Number(b.score || 0) - Number(a.score || 0);
      });
    const candidate = candidates.find((item) => (usage.get(item.userId) || 0) < maxTasksPerUser);
    if (!candidate) continue;
    usage.set(candidate.userId, (usage.get(candidate.userId) || 0) + 1);
    assignments.push({
      taskId: recommendation.taskId,
      userId: candidate.userId,
      ...(candidate.displayName ? { displayName: candidate.displayName } : {}),
      rationale: `greedy score=${Number(candidate.score) || 0}`,
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
};
