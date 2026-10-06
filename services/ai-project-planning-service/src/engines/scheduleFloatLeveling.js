/**
 * Resource leveling around critical path (NOTE-2.2a / RULE-HOW-10).
 * Shift non-critical tasks (totalFloat > 0) later within float without increasing CP finish.
 * When pastDeadline, use fuller float to free early calendar capacity for critical work.
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

function addDays(dateKey, days) {
  if (!dateKey) return null;
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function floatDaysFromHours(totalFloatHours, dailyCap = 8) {
  const h = Number(totalFloatHours) || 0;
  if (h <= 0) return 0;
  return Math.max(0, Math.floor(h / Math.max(1, dailyCap)));
}

/**
 * @param {{
 *   schedule: object[],
 *   taskDates: object,
 *   theoreticalCpm: object,
 *   completion: object,
 *   dailyCapHours?: number,
 *   pastDeadline?: boolean,
 *   projectDeadline?: string|null,
 * }} args
 */
function levelScheduleAroundCriticalPath({
  schedule = [],
  taskDates = {},
  theoreticalCpm = null,
  completion = null,
  dailyCapHours = 8,
  pastDeadline = false,
  projectDeadline = null,
} = {}) {
  const cpm = theoreticalCpm || {};
  const nodes = Array.isArray(cpm.tasks)
    ? cpm.tasks
    : Array.isArray(cpm.nodes)
      ? cpm.nodes
      : [];
  const floatByTask = new Map();
  for (const node of nodes) {
    const id = String(node.id || node.workId || node.taskId || '');
    if (!id) continue;
    const totalFloat = Number(node.totalFloat);
    const critical = node.critical === true || node.isCritical === true || totalFloat === 0;
    floatByTask.set(id, {
      totalFloat: Number.isFinite(totalFloat) ? totalFloat : 0,
      critical,
    });
  }

  const cpFinish = toDateKey(completion?.estimatedEnd);
  const deadlineKey = toDateKey(projectDeadline || completion?.deadline);
  const criticalPath = new Set(
    (cpm.criticalPath || completion?.criticalPath || []).map(String)
  );

  const shiftByTask = new Map();
  for (const [taskId, meta] of floatByTask) {
    if (meta.critical || criticalPath.has(taskId)) continue;
    if (!(meta.totalFloat > 0)) continue;
    const days = floatDaysFromHours(meta.totalFloat, dailyCapHours);
    if (days <= 0) continue;
    // Conservative half-float normally; use nearly full float when past deadline
    let shift = pastDeadline
      ? Math.max(1, Math.floor(days * 0.85))
      : Math.max(1, Math.floor(days / 2));
    const dates = taskDates[taskId];
    const due = toDateKey(dates?.dueDate);
    const finishCap = cpFinish || deadlineKey;
    if (finishCap && due) {
      const maxShift = Math.max(
        0,
        Math.floor(
          (new Date(`${finishCap}T12:00:00Z`) - new Date(`${due}T12:00:00Z`)) / 86400000
        )
      );
      shift = Math.min(shift, maxShift);
    }
    if (shift > 0) shiftByTask.set(taskId, shift);
  }

  if (!shiftByTask.size) {
    return {
      schedule,
      taskDates,
      completion,
      leveledCount: 0,
    };
  }

  const nextSchedule = (schedule || []).map((row) => {
    const taskId = String(row.taskId || '');
    const shift = shiftByTask.get(taskId) || 0;
    if (!shift) return row;
    const dateKey = toDateKey(row.dateKey);
    if (!dateKey) return row;
    return {
      ...row,
      dateKey: addDays(dateKey, shift),
      leveled: true,
    };
  });

  const nextTaskDates = { ...taskDates };
  for (const [taskId, shift] of shiftByTask) {
    const cur = taskDates[taskId];
    if (!cur) continue;
    nextTaskDates[taskId] = {
      ...cur,
      startDate: addDays(toDateKey(cur.startDate), shift),
      dueDate: addDays(toDateKey(cur.dueDate), shift),
      leveled: true,
    };
  }

  // Recompute estimatedEnd without increasing CP finish
  const allEnds = Object.values(nextTaskDates)
    .map((d) => toDateKey(d.dueDate))
    .filter(Boolean)
    .sort();
  let estimatedEnd = allEnds.length ? allEnds[allEnds.length - 1] : completion?.estimatedEnd;
  if (cpFinish && estimatedEnd && estimatedEnd > cpFinish) {
    estimatedEnd = cpFinish;
  }

  return {
    schedule: nextSchedule,
    taskDates: nextTaskDates,
    completion: {
      ...(completion || {}),
      estimatedEnd: estimatedEnd || completion?.estimatedEnd,
      leveled: true,
    },
    leveledCount: shiftByTask.size,
  };
}

module.exports = {
  levelScheduleAroundCriticalPath,
  floatDaysFromHours,
  addDays,
  toDateKey,
};
