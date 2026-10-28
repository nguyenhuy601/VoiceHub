/**
 * Expand LLM Story→Sprint assignments to leaf tasks + effort from WBS.
 * Does not drop PBIs for capacity (validator reports that). No heuristic auto-assign.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function roundHours(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function pbiChildIds(pbi) {
  return asArray(pbi?.tasks)
    .map((task) => String(task?.id || '').trim())
    .filter(Boolean);
}

function pbiEffortHours(pbi) {
  return roundHours(
    asArray(pbi?.tasks).reduce((sum, task) => {
      const hours = Number(task?.effortHours);
      return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
    }, 0)
  );
}

/**
 * @returns {{
 *   sprints: object[],
 *   unallocated: object[],
 *   inventIssues: object[],
 *   assignments: object,
 *   meta: object
 * }}
 */
function expandSprintAssignment({
  sprints = [],
  rawProposal = {},
  pbis = [],
  allowLists = {},
} = {}) {
  const pbiById = new Map(asArray(pbis).map((pbi) => [String(pbi.id), pbi]));
  const allowSprint = new Set(asArray(allowLists.sprintIds).map(String));
  const allowPbi = new Set(asArray(allowLists.pbiIds).map(String));
  const inventIssues = [];
  const claimedPbi = new Map(); // pbiId → sprintId
  const assignments = {};

  const sprintList = asArray(sprints).map((sprint) => ({
    ...sprint,
    id: String(sprint.id),
    taskIds: [],
    pbiIds: [],
    effortHours: 0,
    goal: sprint.goal || undefined,
    rationale: undefined,
    capacityHours:
      sprint.capacityHours != null && Number(sprint.capacityHours) > 0
        ? Number(sprint.capacityHours)
        : null,
    utilizationPct: null,
  }));
  const sprintById = new Map(sprintList.map((s) => [String(s.id), s]));

  for (const row of asArray(rawProposal?.sprints)) {
    const sprintId = String(row?.id || '').trim();
    if (!sprintId) continue;
    if (allowSprint.size && !allowSprint.has(sprintId)) {
      inventIssues.push({
        code: 'sprint_id_not_in_allow',
        sprintId,
        message: `Sprint id không nằm trong ALLOW: ${sprintId}`,
      });
      continue;
    }
    const sprint = sprintById.get(sprintId);
    if (!sprint) {
      inventIssues.push({
        code: 'sprint_id_not_in_allow',
        sprintId,
        message: `Sprint id không có trên schedule: ${sprintId}`,
      });
      continue;
    }

    const goal = String(row?.goal || '').trim().slice(0, 200);
    const rationale = String(row?.rationale || row?.explanation || '').trim().slice(0, 400);
    if (goal) sprint.goal = goal;
    if (rationale) sprint.rationale = rationale;

    const pbiIds = [];
    for (const rawId of asArray(row?.pbiIds)) {
      const pbiId = String(rawId || '').trim();
      if (!pbiId) continue;
      if (allowPbi.size && !allowPbi.has(pbiId)) {
        inventIssues.push({
          code: 'pbi_not_in_allow',
          sprintId,
          pbiId,
          message: `PBI không nằm trong ALLOW: ${pbiId}`,
        });
        continue;
      }
      if (!pbiById.has(pbiId)) {
        inventIssues.push({
          code: 'pbi_not_in_allow',
          sprintId,
          pbiId,
          message: `PBI không có trong facts: ${pbiId}`,
        });
        continue;
      }
      if (claimedPbi.has(pbiId)) {
        inventIssues.push({
          code: 'duplicate_pbi',
          sprintId,
          pbiId,
          message: `PBI ${pbiId} đã được xếp vào ${claimedPbi.get(pbiId)}`,
        });
        continue;
      }
      const pbi = pbiById.get(pbiId);
      if (!pbi.assignable) {
        inventIssues.push({
          code: pbi.blockedReason || 'not_ready',
          sprintId,
          pbiId,
          message: `PBI ${pbiId} chưa sẵn sàng phân bổ`,
        });
        continue;
      }
      claimedPbi.set(pbiId, sprintId);
      pbiIds.push(pbiId);
      const childIds = pbiChildIds(pbi);
      const effort = pbiEffortHours(pbi);
      sprint.pbiIds.push(pbiId);
      sprint.taskIds.push(...childIds);
      sprint.effortHours = roundHours(sprint.effortHours + effort);
    }
    assignments[sprintId] = { goal: sprint.goal || '', rationale: sprint.rationale || '', pbiIds };
  }

  for (const sprint of sprintList) {
    if (!assignments[sprint.id]) {
      assignments[sprint.id] = { goal: sprint.goal || '', pbiIds: [] };
    }
    if (sprint.capacityHours != null && sprint.capacityHours > 0) {
      sprint.utilizationPct = Math.round((sprint.effortHours / sprint.capacityHours) * 10000) / 100;
    }
  }

  const unallocated = [];
  for (const pbi of asArray(pbis)) {
    const id = String(pbi.id);
    if (claimedPbi.has(id)) continue;
    unallocated.push({
      taskId: null,
      pbiId: id,
      reasonCode: pbi.assignable ? 'not_ready' : pbi.blockedReason || 'not_ready',
      reason: pbi.assignable
        ? 'PBI chưa được chọn vào Sprint nào trong đề xuất.'
        : 'PBI chưa sẵn sàng phân bổ.',
    });
  }

  return {
    sprints: sprintList,
    unallocated,
    inventIssues,
    assignments,
    deferred: asArray(rawProposal?.deferred),
    meta: {
      allocationSource: 'llm',
      expandedPbiCount: claimedPbi.size,
      unallocatedCount: unallocated.length,
    },
  };
}

module.exports = {
  expandSprintAssignment,
  pbiChildIds,
  pbiEffortHours,
};
