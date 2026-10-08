/**
 * W9 — map Blueprint planning.tasks → import plan (not FR→Task).
 */

const { ensureAiAnalysisContainer } = require('./aiAnalysisContainer');
const { toDateKey, taskDatesFromSchedule } = require('./scheduleDateKeys');

function assertBlueprintReadyForProjectCreate(pack) {
  const { assertGate2ProjectPlanConfirmed } = require('../tools/assertGate2ProjectPlanConfirmed');
  assertGate2ProjectPlanConfirmed(pack);
  const container = ensureAiAnalysisContainer(pack?.aiAnalysis);
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

/** Parent-before-child by ancestor depth (epic → feature → story → task). */
function sortBlueprintTasksParentsFirst(tasks = []) {
  const byId = new Map(tasks.map((t) => [String(t.id), t]));
  const depthMemo = new Map();

  function depthOf(id, visiting = new Set()) {
    const key = String(id);
    if (depthMemo.has(key)) return depthMemo.get(key);
    if (visiting.has(key)) return 0;
    const node = byId.get(key);
    if (!node) {
      depthMemo.set(key, 0);
      return 0;
    }
    const parentId = node.parentId != null ? String(node.parentId) : '';
    if (!parentId || !byId.has(parentId)) {
      depthMemo.set(key, 0);
      return 0;
    }
    visiting.add(key);
    const d = 1 + depthOf(parentId, visiting);
    visiting.delete(key);
    depthMemo.set(key, d);
    return d;
  }

  return [...tasks].sort((a, b) => {
    const da = depthOf(a.id);
    const db = depthOf(b.id);
    if (da !== db) return da - db;
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || String(a.id).localeCompare(String(b.id));
  });
}

/**
 * Build ordered import rows from blueprint tasks (parent before children).
 * Preserves WBS `level` for epic/feature → PlanningItem and story/task → cards.
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
  const byId = new Map(tasks.map((t) => [String(t.id), t]));
  const sorted = sortBlueprintTasksParentsFirst(tasks);

  const rows = sorted.map((t, index) => {
    const dates = resolveBlueprintTaskDates(t, scheduleDatesByTask);
    const parentId = t.parentId != null ? String(t.parentId) : '';
    return {
      blueprintTaskId: t.id,
      parentBlueprintTaskId: parentId && byId.has(parentId) ? parentId : null,
      name: t.name,
      level: t.level != null ? String(t.level) : '',
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
  sortBlueprintTasksParentsFirst,
};
