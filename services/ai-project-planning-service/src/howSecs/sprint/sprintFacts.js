/**
 * Sprint facts — read stored planning fields and group ids.
 * Does not sum hours, walk the calendar, or run CPM.
 */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function idOf(row) {
  return String(row?.id || row?.taskId || '').trim();
}

function dateKey(value) {
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function isStory(task) {
  return String(task?.level || '').toLowerCase() === 'story';
}

function isLeaf(task) {
  const level = String(task?.level || 'task').toLowerCase();
  return level === 'task' || level === 'subtask';
}

function isQaTask(task) {
  if (String(task?.effortPhase || '').toLowerCase() === 'qa') return true;
  const role = String(task?.suggestedRoleKey || '').toLowerCase();
  return role === 'qa_engineer' || role.includes('qa');
}

function cpmByWorkId(theoreticalCpm) {
  const map = new Map();
  if (!theoreticalCpm || typeof theoreticalCpm !== 'object') return map;
  for (const node of asArray(theoreticalCpm.nodes)) {
    const id = String(node?.workId || node?.id || '').trim();
    if (id) map.set(id, node);
  }
  for (const row of asArray(theoreticalCpm.tasks)) {
    const id = String(row?.id || row?.workId || '').trim();
    if (id && !map.has(id)) map.set(id, row);
  }
  return map;
}

function indexByParent(tasks) {
  const byParent = new Map();
  for (const task of tasks) {
    const parentId = task?.parentId == null || task.parentId === '' ? '' : String(task.parentId);
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(task);
  }
  return byParent;
}

function leavesUnder(storyId, byParent) {
  const leaves = [];
  const stack = [String(storyId)];
  const seen = new Set();
  while (stack.length) {
    const parentId = stack.pop();
    for (const child of byParent.get(parentId) || []) {
      const childId = idOf(child);
      if (!childId || seen.has(childId)) continue;
      seen.add(childId);
      if (isLeaf(child)) leaves.push(child);
      else stack.push(childId);
    }
  }
  return leaves;
}

function storiesOf(container) {
  const backlog = asArray(container?.planning?.backlog?.stories);
  if (backlog.length) return backlog.filter((row) => row && idOf(row));
  return asArray(container?.planning?.tasks).filter((task) => isStory(task) && idOf(task));
}

function frPriority(pack, sourceFrIds) {
  const wanted = new Set(asArray(sourceFrIds).map((id) => String(id)));
  if (!wanted.size) return null;
  const frs = asArray(pack?.functionalRequirements || pack?.frs || pack?.srs?.functionalRequirements);
  for (const fr of frs) {
    const id = String(fr?.id || fr?.externalId || fr?.frId || '').trim();
    if (wanted.has(id) && fr?.priority) return String(fr.priority);
  }
  return null;
}

function readEdges(container) {
  const analysis = container?.analyses?.dependency || {};
  const deps = asArray(analysis.dependencies);
  if (deps.length) {
    return deps
      .map((row) => ({
        predecessorTaskId: String(row?.predecessorTaskId || '').trim(),
        successorTaskId: String(row?.successorTaskId || '').trim(),
      }))
      .filter((row) => row.predecessorTaskId && row.successorTaskId);
  }
  return asArray(analysis.edges)
    .map((edge) => ({
      predecessorTaskId: String(edge?.to || edge?.predecessorTaskId || '').trim(),
      successorTaskId: String(edge?.from || edge?.successorTaskId || '').trim(),
    }))
    .filter((row) => row.predecessorTaskId && row.successorTaskId);
}

function feasibilityFromStoredDates(sprint, taskIds, taskById, cpmPresent) {
  if (!cpmPresent) return 'unverified';
  const end = dateKey(sprint?.endDate);
  if (!end) return 'unverified';
  const dueDates = [];
  for (const taskId of taskIds) {
    const due = dateKey(taskById.get(taskId)?.dueDate);
    if (due) dueDates.push(due);
  }
  if (!dueDates.length) return 'unverified';
  const latest = dueDates.sort().at(-1);
  if (latest > end) return 'time_infeasible';
  if (latest === end) return 'time_tight';
  return 'time_slack';
}

function confirmationFor(feasibility, { hardGate, capacityConflictCount, dodGap }) {
  if (feasibility === 'time_infeasible') return 'not_feasible';
  if (
    feasibility === 'time_tight' ||
    feasibility === 'unverified' ||
    hardGate ||
    capacityConflictCount > 0 ||
    dodGap
  ) {
    return 'at_risk';
  }
  return 'pending_confirmation';
}

function buildSprintFacts({ container = {}, pack = {} } = {}) {
  const tasks = asArray(container?.planning?.tasks);
  const taskById = new Map(tasks.map((task) => [idOf(task), task]).filter(([id]) => id));
  const byParent = indexByParent(tasks);
  const cpm = container?.planning?.theoreticalCpm;
  const cpmPresent = Boolean(cpm && typeof cpm === 'object');
  const cpmNodes = cpmByWorkId(cpmPresent ? cpm : null);
  const schedulePlan = container?.planning?.schedulePlan || {};
  const sprints = asArray(schedulePlan.sprints).filter((sprint) => idOf(sprint));
  const capacityPlan =
    container?.resource?.capacityPlan && typeof container.resource.capacityPlan === 'object'
      ? container.resource.capacityPlan
      : null;
  const capacityConflicts = asArray(container?.resource?.capacityConflicts);
  const sprintOfTask = new Map();
  sprints.forEach((sprint, index) => {
    for (const taskId of asArray(sprint.taskIds).map(String)) {
      if (!sprintOfTask.has(taskId)) sprintOfTask.set(taskId, { sprintId: idOf(sprint), index });
    }
  });

  const placed = new Set(sprintOfTask.keys());
  const qaOutsideSprint = tasks
    .filter((task) => isLeaf(task) && isQaTask(task) && idOf(task) && !placed.has(idOf(task)))
    .map((task) => idOf(task));

  const pbis = storiesOf(container).map((story) => {
    const storyId = idOf(story);
    const leaves = leavesUnder(storyId, byParent);
    const tasksBrief = leaves.map((task) => {
      const taskId = idOf(task);
      const node = cpmNodes.get(taskId) || {};
      const hours = task?.effortHours;
      return {
        id: taskId,
        effortHours: hours == null || hours === '' || !Number.isFinite(Number(hours)) ? null : Number(hours),
        startDate: dateKey(task?.startDate),
        dueDate: dateKey(task?.dueDate),
        es: node.es ?? null,
        ef: node.ef ?? null,
        durationHours: node.durationHours ?? null,
        isCritical: Boolean(node.isCritical || node.critical),
        sprintId: sprintOfTask.get(taskId)?.sprintId || null,
      };
    });
    const missingEffort = tasksBrief.some((row) => row.effortHours == null);
    const engineSprintIndexes = [
      ...new Set(
        tasksBrief
          .map((row) => sprintOfTask.get(row.id)?.index)
          .filter((index) => index != null)
      ),
    ];
    return {
      id: storyId,
      title: String(story.name || story.title || storyId),
      priority: story.priority ? String(story.priority) : frPriority(pack, story.sourceFrIds),
      assignable: tasksBrief.length > 0 && !missingEffort,
      blockedReason: !tasksBrief.length ? 'not_ready' : missingEffort ? 'missing_effort' : null,
      tasks: tasksBrief,
      engineSprintIndexes,
    };
  });

  const hardGate = Boolean(capacityPlan?.hardGate);
  const sprintFacts = sprints.map((sprint) => {
    const taskIds = asArray(sprint.taskIds).map(String).filter(Boolean);
    const feasibility = feasibilityFromStoredDates(sprint, taskIds, taskById, cpmPresent);
    return {
      id: idOf(sprint),
      name: sprint.name || idOf(sprint),
      startDate: dateKey(sprint.startDate),
      endDate: dateKey(sprint.endDate),
      sprintLengthDays: schedulePlan?.meta?.sprintLengthDays ?? null,
      taskIds,
      effortHours: sprint.effortHours == null ? null : sprint.effortHours,
      feasibility,
      confirmation: confirmationFor(feasibility, {
        hardGate,
        capacityConflictCount: capacityConflicts.length,
        dodGap: qaOutsideSprint.length > 0,
      }),
    };
  });

  const missingSlots = [];
  if (!sprintFacts.some((sprint) => sprint.startDate && sprint.endDate)) {
    missingSlots.push('upstream.scheduleWindows');
  }
  if (!pbis.length) missingSlots.push('upstream.pbis');
  if (!capacityPlan) missingSlots.push('resource.capacityPlan');

  const openQuestions = [];
  if (!cpmPresent) {
    openQuestions.push({
      code: 'unverified_sprint_cpm',
      message: 'Chưa có theoreticalCpm. Timebox giữ nguyên. Chưa kết luận ngày hoàn thành Sprint.',
    });
  }
  if (qaOutsideSprint.length) {
    openQuestions.push({
      code: 'dod_work_not_in_sprint',
      message: 'Có task kiểm thử trên WBS chưa nằm trong sprint.',
      taskIds: qaOutsideSprint,
    });
  }

  return {
    ok: missingSlots.length === 0,
    missingSlots,
    openQuestions,
    cpmPresent,
    projectDurationHours: cpmPresent ? cpm.projectDurationHours ?? null : null,
    criticalPath: cpmPresent ? asArray(cpm.criticalPath) : [],
    allowLists: {
      sprintIds: sprintFacts.map((sprint) => sprint.id),
      pbiIds: pbis.filter((pbi) => pbi.assignable).map((pbi) => pbi.id),
    },
    pbis,
    sprints: sprintFacts,
    edges: readEdges(container),
    capacity: capacityPlan
      ? {
          hardGate,
          totalSupplyHours: capacityPlan.totalSupplyHours ?? null,
          totalDemandHours: capacityPlan.totalDemandHours ?? null,
          totalGapHours: capacityPlan.totalGapHours ?? null,
          byRole: asArray(capacityPlan.byRole),
          conflicts: capacityConflicts.map((row) => ({ ...row })),
        }
      : null,
    qaOutsideSprint,
  };
}

module.exports = {
  buildSprintFacts,
  feasibilityFromStoredDates,
  confirmationFor,
};
