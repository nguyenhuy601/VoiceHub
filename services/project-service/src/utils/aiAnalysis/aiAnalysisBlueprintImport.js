/**
 * W9 — map Blueprint planning.tasks → import plan (not FR→Task).
 */

const { ensureAiAnalysisContainer, getJobStatus } = require('./aiAnalysisContainer');
const { toDateKey, taskDatesFromSchedule } = require('./aiAnalysisScheduleCapacity');

function assertBlueprintReadyForProjectCreate(pack) {
  const container = ensureAiAnalysisContainer(pack?.aiAnalysis);
  const jobPlan = getJobStatus(container, 'projectPlan');
  if (jobPlan !== 'confirmed') {
    const err = new Error(
      'projectPlan must be confirmed before create project from Blueprint'
    );
    err.statusCode = 409;
    err.errorCode = 'AI_ANALYSIS_BLUEPRINT_NOT_READY';
    err.details = { projectPlan: jobPlan };
    throw err;
  }
  const tasks = container.planning?.tasks || [];
  if (!tasks.length) {
    const err = new Error('Blueprint planning.tasks is empty');
    err.statusCode = 422;
    err.errorCode = 'AI_ANALYSIS_BLUEPRINT_EMPTY_TASKS';
    throw err;
  }
  return container;
}

/**
 * Prefer task.startDate/dueDate from scheduleCapacity; fallback to schedule rows.
 */
function resolveBlueprintTaskDates(task, scheduleDatesByTask) {
  const fromTaskStart = toDateKey(task?.startDate);
  const fromTaskDue = toDateKey(task?.dueDate);
  if (fromTaskStart && fromTaskDue) {
    return { startDate: fromTaskStart, dueDate: fromTaskDue };
  }
  const fromSchedule = scheduleDatesByTask?.[String(task?.id || '')] || null;
  if (fromSchedule?.startDate && fromSchedule?.dueDate) {
    return {
      startDate: fromSchedule.startDate,
      dueDate: fromSchedule.dueDate,
    };
  }
  if (fromTaskStart || fromTaskDue || fromSchedule?.startDate || fromSchedule?.dueDate) {
    return {
      startDate: fromTaskStart || fromSchedule?.startDate || null,
      dueDate: fromTaskDue || fromSchedule?.dueDate || null,
    };
  }
  return { startDate: null, dueDate: null };
}

/**
 * Build ordered import rows from blueprint tasks (parent before children).
 */
function mapBlueprintTasksToImportPlan(container, { taskIds = null, applyAssignees = true } = {}) {
  const c = ensureAiAnalysisContainer(container);
  let tasks = [...(c.planning?.tasks || [])];
  if (Array.isArray(taskIds) && taskIds.length) {
    const allow = new Set(taskIds.map(String));
    tasks = tasks.filter((t) => allow.has(String(t.id)));
  }

  const assignByTask = new Map();
  if (applyAssignees) {
    for (const a of c.resource?.assignments || []) {
      if (a?.taskId && a?.userId) assignByTask.set(String(a.taskId), String(a.userId));
    }
  }

  const scheduleDatesByTask = taskDatesFromSchedule(c.resource?.schedule || []);

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const sorted = [...tasks].sort((a, b) => {
    const da = a.parentId && byId.has(a.parentId) ? 1 : 0;
    const db = b.parentId && byId.has(b.parentId) ? 1 : 0;
    if (da !== db) return da - db;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
  });

  const rows = sorted.map((t, index) => {
    const dates = resolveBlueprintTaskDates(t, scheduleDatesByTask);
    return {
      blueprintTaskId: t.id,
      parentBlueprintTaskId: t.parentId && byId.has(t.parentId) ? t.parentId : null,
      name: t.name,
      area: t.area || '',
      sourceFrIds: Array.isArray(t.sourceFrIds) ? t.sourceFrIds : [],
      sourceCapabilityIds: Array.isArray(t.sourceCapabilityIds) ? t.sourceCapabilityIds : [],
      suggestedRoleKey: t.suggestedRoleKey || '',
      effortHours: t.effortHours ?? null,
      startDate: dates.startDate,
      dueDate: dates.dueDate,
      sortOrder: t.sortOrder ?? index,
      assigneeUserId: applyAssignees ? assignByTask.get(String(t.id)) || null : null,
    };
  });

  return {
    rows,
    createdTaskCount: rows.length,
    assignedCount: rows.filter((r) => r.assigneeUserId).length,
    skippedTaskIds: [],
  };
}

module.exports = {
  assertBlueprintReadyForProjectCreate,
  mapBlueprintTasksToImportPlan,
  resolveBlueprintTaskDates,
};
