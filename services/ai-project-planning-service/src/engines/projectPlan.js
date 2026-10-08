/**
 * Project plan — execution plan + additive planSummary (CP / conflicts / float rows).
 * HARD-03: summary derived from real container fields only.
 */

function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function buildExecutionPlanFromContainer(container = {}) {
  const completion = container?.planning?.completion || null;
  const schedule = container?.resource?.schedule || [];
  const assignments = container?.resource?.assignments || [];
  const byTask = new Map();

  for (const row of schedule) {
    const tid = String(row.taskId || '');
    if (!tid) continue;
    if (!byTask.has(tid)) {
      byTask.set(tid, {
        taskId: tid,
        userId: row.userId,
        displayName: row.displayName,
        days: [],
      });
    }
    byTask.get(tid).days.push({
      dateKey: row.dateKey,
      hours: row.hours,
    });
  }

  const works = [...byTask.values()].map((w) => {
    const keys = (w.days || [])
      .map((d) => toDateKey(d.dateKey))
      .filter(Boolean)
      .sort();
    return {
      ...w,
      startDate: keys[0] || null,
      endDate: keys.length ? keys[keys.length - 1] : null,
    };
  });

  const tasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];

  return {
    projectStart: completion?.projectStart || null,
    estimatedEnd: completion?.estimatedEnd || null,
    totalEffortHours:
      completion?.totalEffortHours ??
      container?.planning?.effort?.estimatedHoursTotal ??
      null,
    criticalPath: completion?.criticalPath || container?.planning?.criticalWorkIds || [],
    assignments,
    works,
    taskCount: tasks.length,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Whitelist planSummary for Gate2 FE (HARD-03 real fields).
 */
function buildPlanSummary(container = {}) {
  const completion = container?.planning?.completion || {};
  const conflicts = Array.isArray(container?.resource?.capacityConflicts)
    ? container.resource.capacityConflicts
    : [];
  const recommendations = Array.isArray(container?.resource?.recommendations)
    ? container.resource.recommendations
    : [];
  const unassignedFromRecs = recommendations.filter((r) => {
    const cands = Array.isArray(r.candidates) ? r.candidates : Array.isArray(r.shortlist) ? r.shortlist : [];
    return !cands.some((c) => c.feasible !== false);
  }).length;
  const unassignedIds = Array.isArray(container?.resource?.unassigned)
    ? container.resource.unassigned.length
    : Array.isArray(container?.resource?.matching?.unassigned)
      ? container.resource.matching.unassigned.length
      : unassignedFromRecs;

  const criticalPath = Array.isArray(completion.criticalPath)
    ? completion.criticalPath
    : Array.isArray(container?.planning?.criticalWorkIds)
      ? container.planning.criticalWorkIds
      : [];

  const start = toDateKey(completion.projectStart);
  const end = toDateKey(completion.estimatedEnd);
  let criticalPathDays = null;
  if (start && end) {
    const a = new Date(`${start}T12:00:00.000Z`);
    const b = new Date(`${end}T12:00:00.000Z`);
    criticalPathDays = Math.max(0, Math.round((b - a) / 86400000) + 1);
  }

  const deadline = toDateKey(completion.deadline);
  let deadlineConflict = null;
  if (deadline && end && end > deadline) {
    const d0 = new Date(`${deadline}T12:00:00.000Z`);
    const d1 = new Date(`${end}T12:00:00.000Z`);
    const daysOver = Math.max(0, Math.round((d1 - d0) / 86400000));
    deadlineConflict = {
      deadline,
      estimatedEnd: end,
      daysOver,
      needsPmReview: true,
    };
  }
  // Also from capacityConflicts past_deadline
  if (!deadlineConflict) {
    const past = conflicts.find((c) => String(c?.type || '') === 'past_deadline');
    if (past) {
      const dl = toDateKey(past.deadline);
      const ee = toDateKey(past.estimatedEnd);
      let daysOver = null;
      if (dl && ee) {
        const d0 = new Date(`${dl}T12:00:00.000Z`);
        const d1 = new Date(`${ee}T12:00:00.000Z`);
        daysOver = Math.max(0, Math.round((d1 - d0) / 86400000));
      }
      deadlineConflict = {
        deadline: dl,
        estimatedEnd: ee,
        daysOver,
        needsPmReview: true,
      };
    }
  }

  const cpmTasks = Array.isArray(container?.planning?.theoreticalCpm?.tasks)
    ? container.planning.theoreticalCpm.tasks
    : [];
  const taskById = new Map(
    (container?.planning?.tasks || []).map((t) => [String(t.id || t.taskId), t])
  );
  const criticalFloatRows = [];
  const criticalSet = new Set(criticalPath.map(String));
  for (const row of cpmTasks) {
    const id = String(row.id || row.taskId || '');
    if (!id || (criticalSet.size && !criticalSet.has(id) && !row.critical)) continue;
    if (!row.critical && criticalSet.size && !criticalSet.has(id)) continue;
    const task = taskById.get(id);
    criticalFloatRows.push({
      taskId: id,
      name: task?.name || row.name || id,
      totalFloat: Number(row.totalFloat) || 0,
      start: task?.startDate || null,
      finish: task?.dueDate || null,
    });
    if (criticalFloatRows.length >= 20) break;
  }
  // Fallback: use critical path ids without CPM rows
  if (!criticalFloatRows.length && criticalPath.length) {
    for (const id of criticalPath.slice(0, 20)) {
      const task = taskById.get(String(id));
      criticalFloatRows.push({
        taskId: String(id),
        name: task?.name || String(id),
        totalFloat: 0,
        start: task?.startDate || null,
        finish: task?.dueDate || null,
      });
    }
  }

  return {
    criticalPathDays,
    conflictCount: conflicts.length,
    unassignedCount: unassignedIds,
    criticalFloatRows,
    deadlineConflict,
  };
}

function runProjectPlanEngine(container = {}) {
  const executionPlan = buildExecutionPlanFromContainer(container);
  const planSummary = buildPlanSummary(container);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    executionPlan,
    planSummary,
    meta: {
      source: 'deterministic',
      llmCalls: 0,
      taskCount: executionPlan.taskCount,
      conflictCount: planSummary.conflictCount,
    },
  };
}

function applyProjectPlanToContainer(container, planResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.executionPlan = planResult.executionPlan || planResult || null;
  if (planResult.planSummary) {
    next.planning.planSummary = planResult.planSummary;
  }
  return next;
}

module.exports = {
  buildExecutionPlanFromContainer,
  buildPlanSummary,
  runProjectPlanEngine,
  applyProjectPlanToContainer,
  toDateKey,
};
