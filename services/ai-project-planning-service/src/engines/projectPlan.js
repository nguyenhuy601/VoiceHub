/**
 * Project plan — build execution plan from container (schedule / completion / assignments).
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

function runProjectPlanEngine(container = {}) {
  const executionPlan = buildExecutionPlanFromContainer(container);
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    executionPlan,
    meta: {
      source: 'deterministic',
      llmCalls: 0,
      taskCount: executionPlan.taskCount,
    },
  };
}

function applyProjectPlanToContainer(container, planResult) {
  const next = {
    ...container,
    planning: { ...(container?.planning || {}) },
  };
  next.planning.executionPlan = planResult.executionPlan || planResult || null;
  return next;
}

module.exports = {
  buildExecutionPlanFromContainer,
  runProjectPlanEngine,
  applyProjectPlanToContainer,
  toDateKey,
};
