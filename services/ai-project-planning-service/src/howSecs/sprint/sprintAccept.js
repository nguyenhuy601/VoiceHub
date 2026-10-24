/**
 * Sprint accept — keep the timebox and stored hours. Filter ids only.
 */

const { confirmationFor } = require('./sprintFacts');

function clip(value, max = 200) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sameIdSet(left, right) {
  const a = [...left].map(String).filter(Boolean).sort();
  const b = [...right].map(String).filter(Boolean).sort();
  if (a.length !== b.length) return false;
  return a.every((id, index) => id === b[index]);
}

function engineSprintIndexByTask(sprints) {
  const map = new Map();
  sprints.forEach((sprint, index) => {
    for (const taskId of asArray(sprint.taskIds)) map.set(String(taskId), index);
  });
  return map;
}

function acceptSprint({ raw = {}, container = {}, facts = {}, skippedReason = null } = {}) {
  const planning = container.planning || {};
  const sourcePlan = planning.schedulePlan || {};
  const schedulePlan = {
    ...sourcePlan,
    sprints: asArray(sourcePlan.sprints).map((sprint) => ({
      ...sprint,
      taskIds: asArray(sprint.taskIds).map(String),
    })),
    meta: { ...(sourcePlan.meta || {}) },
  };
  const factSprintById = new Map((facts.sprints || []).map((sprint) => [sprint.id, sprint]));
  const pbiById = new Map((facts.pbis || []).map((pbi) => [pbi.id, pbi]));
  const allowSprint = new Set(facts.allowLists?.sprintIds || []);
  const sprintIndex = new Map(schedulePlan.sprints.map((sprint, index) => [String(sprint.id), index]));
  const engineIndexByTask = engineSprintIndexByTask(schedulePlan.sprints);
  const rejectedInvent = [];
  const deferred = [];
  const conflicts = [];

  function pushDeferred(pbiId, reasonCode, reason) {
    deferred.push({ pbiId, reasonCode, reason });
  }

  const skip = skippedReason || (!facts.ok ? 'semantic_incomplete' : null);
  if (skip) {
    schedulePlan.sprints = schedulePlan.sprints.map((sprint) => {
      const fact = factSprintById.get(String(sprint.id));
      return {
        ...sprint,
        feasibility: fact?.feasibility || 'unverified',
        confirmation: fact?.confirmation || 'pending_confirmation',
      };
    });
    schedulePlan.deferred = deferred;
    schedulePlan.conflicts = conflicts;
    schedulePlan.openQuestions = asArray(facts.openQuestions);
    schedulePlan.splitProposals = [];
    schedulePlan.meta = {
      ...schedulePlan.meta,
      sprintPlanningSource: 'engine',
      sprintLlmSkipped: skip,
      rejectedInvent,
    };
    return pack(container, schedulePlan);
  }

  const proposedBySprint = new Map();
  for (const row of asArray(raw.sprints)) {
    const id = String(row?.id || '').trim();
    if (!allowSprint.has(id)) {
      rejectedInvent.push({ reason: 'sprint_id_not_in_allow', id });
      continue;
    }
    proposedBySprint.set(id, row);
  }

  for (const row of asArray(raw.splitProposals)) {
    const pbiId = String(row?.pbiId || '').trim();
    if (!pbiById.has(pbiId)) rejectedInvent.push({ reason: 'split_pbi_not_in_allow', id: pbiId });
  }

  schedulePlan.sprints = schedulePlan.sprints.map((sprint) => {
    const sprintId = String(sprint.id);
    const proposal = proposedBySprint.get(sprintId);
    const fact = factSprintById.get(sprintId);
    const keptDates = {
      startDate: sprint.startDate,
      endDate: sprint.endDate,
      effortHours: sprint.effortHours,
    };
    if (!proposal) {
      return {
        ...sprint,
        ...keptDates,
        feasibility: fact?.feasibility || 'unverified',
        confirmation: fact?.confirmation || 'pending_confirmation',
      };
    }

    const acceptedPbiIds = [];
    const acceptedTaskIds = [];
    const chosenIndex = sprintIndex.get(sprintId);
    for (const rawId of asArray(proposal.pbiIds)) {
      const pbiId = String(rawId || '').trim();
      if (!pbiId) continue;
      const pbi = pbiById.get(pbiId);
      if (!pbi) {
        rejectedInvent.push({ reason: 'pbi_id_not_in_allow', id: pbiId });
        continue;
      }
      if (!pbi.assignable) {
        pushDeferred(pbiId, pbi.blockedReason || 'missing_effort', 'PBI chưa có effort đã ghi trên task.');
        continue;
      }
      const childIds = pbi.tasks.map((task) => task.id);
      const unmet = (facts.edges || []).some((edge) => {
        if (!childIds.includes(edge.successorTaskId)) return false;
        const predIndex = engineIndexByTask.get(edge.predecessorTaskId);
        return predIndex != null && predIndex > chosenIndex;
      });
      if (unmet) {
        pushDeferred(pbiId, 'dependency_unmet', 'Predecessor đang nằm ở sprint sau.');
        continue;
      }
      acceptedPbiIds.push(pbiId);
      acceptedTaskIds.push(...childIds);
    }

    if (!acceptedPbiIds.length) {
      if (fact?.feasibility === 'time_infeasible') {
        conflicts.push({
          code: 'sprint_timebox_exceeded',
          sprintId,
          message: 'dueDate đã ghi sau endDate của timebox.',
          option: 'Giảm PBI hoặc đổi thứ tự. Không kéo dài Sprint.',
        });
      }
      return {
        ...sprint,
        ...keptDates,
        goal: clip(proposal.goal, 200),
        pbiIds: [],
        feasibility: fact?.feasibility || 'unverified',
        confirmation: fact?.confirmation || 'pending_confirmation',
      };
    }

    const sameSet = sameIdSet(acceptedTaskIds, sprint.taskIds);
    const feasibility = sameSet && facts.cpmPresent ? fact?.feasibility || 'unverified' : 'unverified';
    if (feasibility === 'time_infeasible') {
      conflicts.push({
        code: 'sprint_timebox_exceeded',
        sprintId,
        message: 'dueDate đã ghi sau endDate của timebox.',
        option: 'Giảm PBI hoặc đổi thứ tự. Không kéo dài Sprint.',
      });
    }
    return {
      ...sprint,
      ...keptDates,
      goal: clip(proposal.goal, 200),
      pbiIds: acceptedPbiIds,
      taskIds: acceptedTaskIds,
      feasibility,
      confirmation: confirmationFor(feasibility, {
        hardGate: Boolean(facts.capacity?.hardGate),
        capacityConflictCount: (facts.capacity?.conflicts || []).length,
        dodGap: (facts.qaOutsideSprint || []).length > 0,
      }),
    };
  });

  schedulePlan.deferred = deferred;
  schedulePlan.conflicts = conflicts;
  schedulePlan.splitProposals = asArray(raw.splitProposals)
    .filter((row) => pbiById.has(String(row?.pbiId || '').trim()))
    .map((row) => ({ pbiId: String(row.pbiId), reason: clip(row.reason, 240) }));
  schedulePlan.openQuestions = [...asArray(facts.openQuestions), ...asArray(raw.openQuestions)];
  schedulePlan.meta = {
    ...schedulePlan.meta,
    sprintPlanningSource: 'fact_llm',
    sprintLengthDays: sourcePlan.meta?.sprintLengthDays,
    rejectedInvent,
  };
  return pack(container, schedulePlan);
}

function pack(container, schedulePlan) {
  return {
    container: {
      ...container,
      planning: {
        ...(container.planning || {}),
        schedulePlan,
        backlog: container.planning?.backlog,
      },
    },
    meta: schedulePlan.meta,
  };
}

module.exports = { acceptSprint };
