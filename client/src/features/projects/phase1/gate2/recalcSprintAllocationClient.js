/**
 * Deterministic Gate2 sprint scope recalc after HITL edit (no LLM).
 * Story-atomic: pbiIds → all leaf tasks under each story.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundHours(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function containerOf(pack) {
  if (pack?.aiAnalysis && typeof pack.aiAnalysis === 'object') return pack.aiAnalysis;
  return pack && typeof pack === 'object' ? pack : {};
}

function buildTaskIndex(container) {
  const taskById = new Map();
  for (const task of asArray(container?.planning?.tasks)) {
    const id = String(task?.id || task?.taskId || '').trim();
    if (id) taskById.set(id, task);
  }
  for (const story of asArray(container?.planning?.backlog?.stories)) {
    const id = String(story?.id || '').trim();
    if (id && !taskById.has(id)) taskById.set(id, story);
  }
  const byParent = new Map();
  for (const task of taskById.values()) {
    const parentId =
      task?.parentId != null && task.parentId !== '' ? String(task.parentId) : '';
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(task);
  }
  return { taskById, byParent };
}

function leavesUnder(storyId, byParent, taskById) {
  const leaves = [];
  const stack = [String(storyId)];
  const seen = new Set();
  while (stack.length) {
    const parentId = stack.pop();
    for (const child of byParent.get(parentId) || []) {
      const childId = String(child?.id || child?.taskId || '').trim();
      if (!childId || seen.has(childId)) continue;
      seen.add(childId);
      const level = String(child?.level || taskById.get(childId)?.level || 'task').toLowerCase();
      if (level === 'task' || level === 'subtask') leaves.push(taskById.get(childId) || child);
      else stack.push(childId);
    }
  }
  return leaves;
}

function taskEffort(task) {
  const hours = Number(task?.effortHours ?? task?.effortSeedHours);
  return Number.isFinite(hours) && hours > 0 ? hours : 0;
}

/**
 * @param {object} row — Gate2 releases row (sprint)
 * @param {object} editedPayload
 * @param {object|null} pack
 * @returns {object} next editedPayload with taskIds/effortHours/taskCount/utilizationPct
 */
export function recalcSprintEditedPayload(row, editedPayload = {}, pack = null) {
  if (!row || row.kind !== 'sprint') return editedPayload || {};

  const payload = { ...(editedPayload || {}) };
  const container = containerOf(pack);
  const { taskById, byParent } = buildTaskIndex(container);

  const pbiIds = asArray(payload.pbiIds ?? row.pbiIds)
    .map(String)
    .filter(Boolean);

  let taskIds = [];
  let effortHours = 0;

  if (pbiIds.length) {
    const seen = new Set();
    for (const pbiId of pbiIds) {
      for (const leaf of leavesUnder(pbiId, byParent, taskById)) {
        const tid = String(leaf.id || leaf.taskId || '').trim();
        if (!tid || seen.has(tid)) continue;
        seen.add(tid);
        taskIds.push(tid);
        effortHours += taskEffort(leaf);
      }
    }
  } else {
    taskIds = asArray(payload.taskIds ?? row.taskIds)
      .map(String)
      .filter(Boolean);
    for (const tid of taskIds) {
      effortHours += taskEffort(taskById.get(tid));
    }
  }

  effortHours = roundHours(effortHours);
  const capacityHours =
    payload.capacityHours != null
      ? Number(payload.capacityHours)
      : row.capacityHours != null
        ? Number(row.capacityHours)
        : null;
  const utilizationPct =
    capacityHours != null && capacityHours > 0
      ? Math.round((effortHours / capacityHours) * 10000) / 100
      : null;

  return {
    ...payload,
    pbiIds,
    taskIds,
    effortHours,
    taskCount: taskIds.length,
    capacityHours: Number.isFinite(capacityHours) ? capacityHours : payload.capacityHours,
    utilizationPct,
  };
}

/**
 * Apply recalc onto a decision patch when editing sprint scope fields.
 */
export function withRecalcSprintDecision(row, patch, pack) {
  if (!row || row.kind !== 'sprint' || !patch?.editedPayload) return patch;
  const fieldTouched = patch.editedPayload;
  const shouldRecalc =
    Object.prototype.hasOwnProperty.call(fieldTouched, 'pbiIds') ||
    Object.prototype.hasOwnProperty.call(fieldTouched, 'taskIds');
  if (!shouldRecalc) return patch;
  return {
    ...patch,
    editedPayload: recalcSprintEditedPayload(row, patch.editedPayload, pack),
  };
}

export default recalcSprintEditedPayload;
