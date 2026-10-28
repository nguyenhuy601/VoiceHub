/**
 * Story-first sprint allocation + capacity/dependency validator.
 * PBI (story) is atomic — never partial leaf cut to fill a sprint.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundHours(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function utilizationPct(effortHours, capacityHours) {
  if (capacityHours == null || !(Number(capacityHours) > 0)) return null;
  return Math.round((Number(effortHours) / Number(capacityHours)) * 10000) / 100;
}

function pbiEffortHours(pbi) {
  return roundHours(
    asArray(pbi?.tasks).reduce((sum, task) => {
      const hours = Number(task?.effortHours);
      return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
    }, 0)
  );
}

function pbiChildIds(pbi) {
  return asArray(pbi?.tasks)
    .map((task) => String(task?.id || '').trim())
    .filter(Boolean);
}

function priorityRank(priority) {
  const key = String(priority || '').toLowerCase();
  if (key === 'critical' || key === 'blocker') return 0;
  if (key === 'high' || key === 'p0' || key === 'must') return 1;
  if (key === 'medium' || key === 'p1' || key === 'should') return 2;
  if (key === 'low' || key === 'p2' || key === 'could') return 3;
  return 4;
}

/**
 * Provisional task→sprint index from proposed PBI assignments (before accept).
 */
function provisionalTaskSprintIndex(assignments, pbiById, sprintIndex) {
  const map = new Map();
  for (const [sprintId, assignment] of Object.entries(assignments || {})) {
    const idx = sprintIndex.get(String(sprintId));
    if (idx == null) continue;
    for (const pbiId of asArray(assignment?.pbiIds)) {
      const pbi = pbiById.get(String(pbiId));
      if (!pbi) continue;
      for (const taskId of pbiChildIds(pbi)) {
        if (!map.has(taskId)) map.set(taskId, idx);
      }
    }
  }
  return map;
}

function resolveSprintCapacityHours(sprint, meta = {}) {
  if (sprint?.capacityHours != null && Number(sprint.capacityHours) > 0) {
    return Number(sprint.capacityHours);
  }
  if (meta.teamCapacityHoursPerSprint != null && Number(meta.teamCapacityHoursPerSprint) > 0) {
    return Number(meta.teamCapacityHoursPerSprint);
  }
  return null;
}

/**
 * Allocate PBIs into sprint windows.
 *
 * @param {object} input
 * @param {object[]} input.sprints — windows (dates kept)
 * @param {object} input.assignments — { [sprintId]: { goal?, pbiIds: string[] } }
 * @param {object[]} input.pbis — from buildSprintFacts
 * @param {object[]} input.edges — { predecessorTaskId, successorTaskId }
 * @param {object} [input.meta] — schedulePlan.meta
 * @param {boolean} [input.clearUnassignedSprints] — wipe taskIds when sprint has explicit assignment
 * @returns {{ sprints, deferred, conflicts, unallocated, splitProposals, meta }}
 */
function allocateFromPbis({
  sprints = [],
  assignments = {},
  pbis = [],
  edges = [],
  meta = {},
  clearUnassignedSprints = true,
} = {}) {
  const pbiById = new Map(asArray(pbis).map((pbi) => [String(pbi.id), pbi]));
  const sprintList = asArray(sprints).map((sprint) => ({
    ...sprint,
    taskIds: [],
    pbiIds: [],
    effortHours: 0,
    goal: sprint.goal || undefined,
    capacityHours: resolveSprintCapacityHours(sprint, meta),
    utilizationPct: null,
  }));
  const sprintIndex = new Map(sprintList.map((sprint, index) => [String(sprint.id), index]));
  const placedTaskIndex = new Map();
  const placedPbiIds = new Set();
  const deferred = [];
  const conflicts = [];
  const splitProposals = [];
  const capacityUnverified = Boolean(meta.capacityUnverified) || sprintList.every((s) => s.capacityHours == null);
  const proposedTaskIndex = provisionalTaskSprintIndex(assignments, pbiById, sprintIndex);

  function pushDeferred(pbiId, reasonCode, reason) {
    deferred.push({ pbiId: String(pbiId), reasonCode, reason });
  }

  function tryPlacePbi(sprint, sprintIdx, pbiId, { goal } = {}) {
    const id = String(pbiId || '').trim();
    if (!id) return false;
    if (placedPbiIds.has(id)) {
      pushDeferred(id, 'not_ready', 'PBI đã được xếp vào Sprint khác.');
      return false;
    }
    const pbi = pbiById.get(id);
    if (!pbi) {
      pushDeferred(id, 'not_ready', 'PBI không có trong allow-list.');
      return false;
    }
    if (!pbi.assignable) {
      pushDeferred(id, pbi.blockedReason || 'missing_effort', 'PBI chưa sẵn sàng phân bổ.');
      return false;
    }

    const childIds = pbiChildIds(pbi);
    const effort = pbiEffortHours(pbi);
    const capacity = sprint.capacityHours;

    if (capacity != null && effort > capacity) {
      pushDeferred(id, 'too_large', 'Effort PBI vượt capacity một Sprint của đội.');
      splitProposals.push({
        pbiId: id,
        reason: 'PBI quá lớn so với capacity Sprint — cần chia nhỏ trước khi xếp.',
      });
      return false;
    }

    if (capacity != null && sprint.effortHours + effort > capacity) {
      pushDeferred(id, 'over_capacity', 'Không đủ capacity còn lại trong Sprint.');
      return false;
    }

    const unmet = asArray(edges).some((edge) => {
      if (!childIds.includes(String(edge.successorTaskId))) return false;
      const predId = String(edge.predecessorTaskId || '');
      const predIndex =
        placedTaskIndex.get(predId) ?? proposedTaskIndex.get(predId);
      return predIndex != null && predIndex > sprintIdx;
    });
    if (unmet) {
      pushDeferred(id, 'dependency_unmet', 'Predecessor đang nằm ở sprint sau.');
      return false;
    }

    sprint.pbiIds.push(id);
    sprint.taskIds.push(...childIds);
    sprint.effortHours = roundHours(sprint.effortHours + effort);
    sprint.utilizationPct = utilizationPct(sprint.effortHours, sprint.capacityHours);
    if (goal) sprint.goal = String(goal).trim().slice(0, 200) || sprint.goal;
    placedPbiIds.add(id);
    childIds.forEach((taskId) => placedTaskIndex.set(taskId, sprintIdx));
    return true;
  }

  // Process sprints in order so earlier sprints claim PBIs first
  for (let idx = 0; idx < sprintList.length; idx += 1) {
    const sprint = sprintList[idx];
    const sprintId = String(sprint.id);
    const assignment = assignments[sprintId];
    if (!assignment) {
      if (!clearUnassignedSprints) {
        // keep empty
      }
      continue;
    }
    if (assignment.goal) sprint.goal = String(assignment.goal).trim().slice(0, 200);
    for (const pbiId of asArray(assignment.pbiIds)) {
      tryPlacePbi(sprint, idx, pbiId, { goal: assignment.goal });
    }
  }

  // PBIs never placed → unallocated-style deferred if not already deferred
  const deferredIds = new Set(deferred.map((row) => row.pbiId));
  const unallocated = [];
  for (const pbi of asArray(pbis)) {
    const id = String(pbi.id);
    if (placedPbiIds.has(id) || deferredIds.has(id)) continue;
    unallocated.push({
      taskId: null,
      pbiId: id,
      reasonCode: pbi.assignable ? 'not_ready' : pbi.blockedReason || 'not_ready',
      reason: pbi.assignable
        ? 'PBI chưa được chọn vào Sprint nào.'
        : 'PBI chưa sẵn sàng phân bổ.',
    });
  }

  for (const sprint of sprintList) {
    sprint.utilizationPct = utilizationPct(sprint.effortHours, sprint.capacityHours);
    if (
      sprint.capacityHours != null &&
      sprint.effortHours > sprint.capacityHours
    ) {
      conflicts.push({
        code: 'over_capacity',
        sprintId: String(sprint.id),
        message: 'Tổng effort vượt capacity Sprint.',
        option: 'Giảm PBI hoặc tăng capacity đội. Không kéo dài Sprint.',
      });
    }
  }

  return {
    sprints: sprintList,
    deferred,
    conflicts,
    unallocated,
    splitProposals,
    meta: {
      ...meta,
      capacityUnverified,
      allocatedPbiCount: placedPbiIds.size,
      deferredCount: deferred.length,
      unallocatedCount: unallocated.length,
    },
  };
}

/**
 * Apply allocation result onto an existing schedulePlan (preserve releases/milestones).
 */
function applyAllocationToSchedulePlan(schedulePlan, allocation) {
  const source = schedulePlan && typeof schedulePlan === 'object' ? schedulePlan : {};
  const engineUnallocated = asArray(source.unallocated).filter((row) => row?.taskId);
  const placedTasks = new Set(
    asArray(allocation.sprints).flatMap((sprint) => asArray(sprint.taskIds).map(String))
  );
  const mergedUnallocated = [
    ...asArray(allocation.unallocated),
    ...engineUnallocated.filter((row) => !placedTasks.has(String(row.taskId))),
  ];

  // Rebuild release aggregates from new sprint taskIds
  const releases = asArray(source.releases).map((release) => {
    const sprintIds = asArray(release.sprintIds).map(String);
    const sprintChunk = asArray(allocation.sprints).filter((s) => sprintIds.includes(String(s.id)));
    const seen = new Set();
    const taskIds = [];
    let effortHours = 0;
    for (const sprint of sprintChunk) {
      effortHours += Number(sprint.effortHours) || 0;
      for (const tid of asArray(sprint.taskIds)) {
        const id = String(tid);
        if (!id || seen.has(id)) continue;
        seen.add(id);
        taskIds.push(id);
      }
    }
    return {
      ...release,
      taskIds,
      taskCount: taskIds.length,
      effortHours: roundHours(effortHours),
    };
  });

  return {
    ...source,
    sprints: allocation.sprints,
    releases,
    deferred: allocation.deferred,
    conflicts: allocation.conflicts,
    splitProposals: allocation.splitProposals,
    unallocated: mergedUnallocated,
    meta: {
      ...(source.meta || {}),
      ...(allocation.meta || {}),
      unallocatedCount: mergedUnallocated.length,
    },
  };
}

/**
 * Recalc after HITL edit of pbiIds / goals (deterministic, no LLM).
 */
function recalcSprintAllocation({
  schedulePlan = {},
  pbis = [],
  edges = [],
  assignments = null,
} = {}) {
  const sprints = asArray(schedulePlan.sprints);
  const nextAssignments =
    assignments ||
    Object.fromEntries(
      sprints.map((sprint) => [
        String(sprint.id),
        {
          goal: sprint.goal || '',
          pbiIds: asArray(sprint.pbiIds),
        },
      ])
    );
  const allocation = allocateFromPbis({
    sprints,
    assignments: nextAssignments,
    pbis,
    edges,
    meta: schedulePlan.meta || {},
  });
  return applyAllocationToSchedulePlan(schedulePlan, allocation);
}

module.exports = {
  allocateFromPbis,
  applyAllocationToSchedulePlan,
  recalcSprintAllocation,
  pbiEffortHours,
  pbiChildIds,
  priorityRank,
};
