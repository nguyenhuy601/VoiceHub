/**
 * Map analyses.dependency schema 2.0 (+ legacy edges) → Gate2 / flow display rows.
 */

function clip(value, max = 160) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
}

export function buildTaskNameMap(container) {
  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const map = new Map();
  for (const t of tasks) {
    const id = String(t.id || t.taskId || '').trim();
    if (!id) continue;
    map.set(id, String(t.name || t.title || id).trim());
  }
  return map;
}

export function taskLabel(taskById, taskId) {
  const id = String(taskId || '').trim();
  if (!id) return '?';
  const name = taskById.get(id);
  if (!name || name === id) return id;
  return `${name} (${id})`;
}

export function taskShortName(taskById, taskId) {
  const id = String(taskId || '').trim();
  if (!id) return '?';
  return taskById.get(id) || id;
}

/**
 * Resolve decision overlay for display status.
 * @param {object} row
 * @param {{ action?: string, note?: string }|null} decision
 */
export function resolveDependencyDecisionStatus(row, decision) {
  const action = String(decision?.action || '').toLowerCase();
  if (action === 'accept' || action === 'approve' || action === 'confirm') {
    return 'CONFIRMED';
  }
  if (action === 'reject' || action === 'rejected') {
    return 'REJECTED';
  }
  const raw = String(row?.decisionStatus || row?.status || 'PROPOSED').toUpperCase();
  if (raw === 'CRITICAL' || raw === 'READY') {
    // Legacy row status — treat as proposed for decision column
    return 'PROPOSED';
  }
  if (['PROPOSED', 'CONFIRMED', 'REJECTED'].includes(raw)) return raw;
  return 'PROPOSED';
}

/**
 * Normalize one schema-v2 dependency or legacy edge into a display row fields object.
 */
export function mapDependencyToDisplayFields(dep, index, taskById) {
  const isV2 =
    dep &&
    (dep.predecessorTaskId || dep.successorTaskId || dep.blockingScope || dep.schemaVersion);

  let predecessorTaskId;
  let successorTaskId;
  if (isV2 || dep.predecessorTaskId || dep.successorTaskId) {
    predecessorTaskId = String(dep.predecessorTaskId || dep.to || '').trim();
    successorTaskId = String(dep.successorTaskId || dep.from || '').trim();
  } else {
    // Legacy edge: from = successor, to = predecessor
    predecessorTaskId = String(dep.to || dep.predecessorId || '').trim();
    successorTaskId = String(dep.from || dep.successorId || '').trim();
  }

  const id = String(dep.id || dep.edgeId || `${predecessorTaskId}->${successorTaskId}` || `dep-${index}`);
  const predName = taskShortName(taskById, predecessorTaskId);
  const succName = taskShortName(taskById, successorTaskId);
  const relationLabel = `${predName} → ${succName}`;

  const title = clip(dep.title || dep.reason || relationLabel, 120);
  const reason = clip(dep.reason || dep.evidence || '', 200);
  const blockingScope = String(dep.blockingScope || (dep.blocking === false ? 'INTEGRATION_ONLY' : 'FULL')).toUpperCase();
  const canWorkInParallel =
    dep.canWorkInParallel === true ||
    blockingScope === 'INTEGRATION_ONLY' ||
    blockingScope === 'TEST_ONLY';
  const parallelCondition = clip(dep.parallelCondition || '', 160);
  const relationship = String(dep.relationship || dep.depType || dep.type || dep.kind || 'FS').toUpperCase();
  const decisionStatus = String(dep.status || dep.decisionStatus || 'PROPOSED').toUpperCase();
  const requiredInput =
    dep.requiredInput && typeof dep.requiredInput === 'object'
      ? dep.requiredInput
      : null;

  return {
    id,
    predecessorTaskId,
    successorTaskId,
    predecessorName: predName,
    successorName: succName,
    relationLabel,
    title,
    reason,
    summary: reason || title,
    depType: relationship,
    relationship,
    blockingScope,
    canWorkInParallel,
    parallelCondition,
    parallelLabel: canWorkInParallel
      ? parallelCondition || 'Có thể song song'
      : 'Tuần tự (chặn)',
    requiredInput,
    requiredInputLabel: requiredInput
      ? clip(
          `${requiredInput.name || ''}${requiredInput.condition ? `: ${requiredInput.condition}` : ''}`,
          120
        )
      : '',
    decisionStatus: ['PROPOSED', 'CONFIRMED', 'REJECTED'].includes(decisionStatus)
      ? decisionStatus
      : 'PROPOSED',
    // Keep status for conflict heuristics — REJECTED soft; FULL blocking → note
    status: decisionStatus === 'REJECTED' ? 'REJECTED' : decisionStatus,
    critical: Boolean(dep.critical) || (blockingScope === 'FULL' && !canWorkInParallel),
    source: dep.source || '',
    evidence: Array.isArray(dep.evidence) ? dep.evidence : [],
  };
}

/**
 * Collect display rows from container analyses.dependency.
 */
export function listDependencyDisplayItems(container) {
  const taskById = buildTaskNameMap(container);
  const section = container?.analyses?.dependency || {};
  const hasSchemaV2 = Array.isArray(section.dependencies);
  const unresolvedQuestions = Array.isArray(section.unresolvedQuestions)
    ? section.unresolvedQuestions
    : [];

  // Empty schema-v2 array must not hide legacy edges already stored on the section.
  const v2 = hasSchemaV2 ? section.dependencies : [];
  let rawList = v2.length
    ? v2
    : Array.isArray(section.edges) && section.edges.length
      ? section.edges
      : Array.isArray(container?.planning?.dependencies)
        ? container.planning.dependencies
        : [];

  const items = rawList.map((dep, i) => mapDependencyToDisplayFields(dep, i, taskById));
  return { items, unresolvedQuestions, taskById, section };
}
