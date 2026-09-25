/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisScheduleCapacity.js.
 */
const { greedyAssignFromShortlists } = require('./assignment');
const { buildTaskGraph } = require('./sequencingCpm');

const DAILY_CAP_HOURS = 8;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function addDays(dateKey, days) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function utcNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function holidaySet(calendar) {
  return new Set(
    (calendar?.holidays || [])
      .map((item) => toDateKey(item?.date || item?.day || item?.holidayDate || item))
      .filter(Boolean)
  );
}

function nextWorkingDay(dateKey, calendar) {
  const holidays = holidaySet(calendar);
  let current = dateKey;
  for (let index = 0; index < 366; index += 1) {
    if (
      ![0, 6].includes(new Date(`${current}T12:00:00Z`).getUTCDay()) &&
      !holidays.has(current)
    ) {
      return current;
    }
    current = addDays(current, 1);
  }
  return current;
}

function isMilestoneTask(task) {
  const area = String(task?.area || '').toLowerCase();
  const type = String(task?.type || '').toLowerCase();
  return area === 'milestone' || type === 'milestone';
}

function packScheduleCapacity({
  tasks = [],
  edges = [],
  assignments = [],
  projectStart,
  projectDeadline = null,
  meetingHoursByUserDay = null,
  calendar = null,
} = {}) {
  const start = nextWorkingDay(toDateKey(projectStart) || toDateKey(new Date()), calendar);
  const deadlineKey = toDateKey(projectDeadline);
  const taskById = new Map(tasks.map((task) => [String(task.id || task.taskId), task]));
  const assignmentByTask = new Map(assignments.map((item) => [String(item.taskId), item]));
  const { preds } = buildTaskGraph(tasks, edges);
  const pending = new Set([...taskById.keys()].filter((id) => assignmentByTask.has(id)));
  const finished = new Set();
  const finishByTask = new Map();
  const used = new Map();
  const schedule = [];
  const taskDates = {};
  const capacityConflicts = [];

  let guard = 0;
  const maxIterations = pending.size * 40 + 10;
  while (pending.size && guard < maxIterations) {
    guard += 1;
    let progressed = false;
    for (const taskId of [...pending].sort()) {
      if ([...(preds.get(taskId) || [])].some((id) => !finished.has(id))) continue;
      const assignment = assignmentByTask.get(taskId);
      let remaining = Math.max(0, Number(taskById.get(taskId)?.effortHours) || 0);
      let day = start;
      for (const predecessor of preds.get(taskId) || []) {
        if ((finishByTask.get(predecessor) || '') > day) day = finishByTask.get(predecessor);
      }
      day = nextWorkingDay(day, calendar);
      let firstDay = null;
      let dayGuard = 0;
      while (remaining > 0 && dayGuard < 366) {
        dayGuard += 1;
        const key = `${assignment.userId}|${day}`;
        const meetingMap =
          meetingHoursByUserDay && typeof meetingHoursByUserDay === 'object'
            ? meetingHoursByUserDay
            : {};
        const meetingHours = Math.max(
          0,
          Number(meetingMap[key] ?? meetingMap[day]) || 0
        );
        const available = Math.max(0, DAILY_CAP_HOURS - meetingHours - (used.get(key) || 0));
        if (!available) {
          if (remaining > 0) {
            capacityConflicts.push({
              type: 'zero_capacity_day',
              taskId,
              userId: assignment.userId,
              dateKey: day,
              remainingHours: Math.round(remaining * 100) / 100,
              meetingHours,
            });
          }
          day = nextWorkingDay(addDays(day, 1), calendar);
          continue;
        }
        const hours = Math.min(remaining, available);
        used.set(key, (used.get(key) || 0) + hours);
        schedule.push({
          taskId,
          userId: assignment.userId,
          displayName: assignment.displayName,
          dateKey: day,
          hours: Math.round(hours * 100) / 100,
          meetingHours,
          dailyCap: DAILY_CAP_HOURS,
          usedAfter: Math.round((used.get(key) + meetingHours) * 100) / 100,
        });
        firstDay ||= day;
        remaining -= hours;
        if (remaining > 0) day = nextWorkingDay(addDays(day, 1), calendar);
      }
      if (remaining > 0) {
        capacityConflicts.push({
          type: 'unresolved_effort',
          taskId,
          userId: assignment.userId,
          remainingHours: Math.round(remaining * 100) / 100,
        });
      }
      if (firstDay) taskDates[taskId] = { startDate: firstDay, dueDate: day };
      finishByTask.set(taskId, day);
      finished.add(taskId);
      pending.delete(taskId);
      progressed = true;
    }
    if (!progressed) break;
  }
  const estimatedEnd = [...finishByTask.values()].sort().at(-1) || start;
  if (deadlineKey && estimatedEnd > deadlineKey) {
    capacityConflicts.push({
      type: 'past_deadline',
      estimatedEnd,
      deadline: deadlineKey,
    });
  }

  const milestones = [];
  for (const task of tasks) {
    if (!isMilestoneTask(task)) continue;
    const tid = String(task.id || task.taskId || '');
    milestones.push({
      taskId: tid,
      name: task.name || task.title || tid,
      dateKey: taskDates[tid]?.dueDate || toDateKey(task.dueDate) || null,
    });
  }

  const criticalPath = longestCalendarPath([...taskById.keys()], preds, finishByTask);
  return {
    schedule,
    taskDates,
    capacityConflicts,
    milestones,
    completion: {
      projectStart: start,
      estimatedEnd,
      totalEffortHours:
        Math.round(
          tasks.reduce((sum, task) => sum + (Number(task.effortHours) || 0), 0) *
            100
        ) / 100,
      criticalPath,
      unassignedTaskIds: [...taskById.keys()].filter((id) => !assignmentByTask.has(id)),
      unresolvedPending: [...pending],
      dailyCapHours: DAILY_CAP_HOURS,
      deadline: deadlineKey,
    },
    meta: {
      source: 'engine',
      llmCalls: 0,
      scheduleRowCount: schedule.length,
      capacityConflictCount: capacityConflicts.length,
      milestoneCount: milestones.length,
    },
  };
}

function longestCalendarPath(ids, preds, finishByTask) {
  const memo = new Map();
  function visit(id, visiting = new Set()) {
    if (memo.has(id)) return memo.get(id);
    if (visiting.has(id)) return [];
    const nextVisiting = new Set(visiting).add(id);
    const predecessors = [...(preds.get(id) || [])];
    if (!predecessors.length) {
      const path = finishByTask.has(id) ? [id] : [];
      memo.set(id, path);
      return path;
    }
    let best = [];
    let bestEnd = '';
    for (const predecessor of predecessors) {
      const path = visit(predecessor, nextVisiting);
      const candidate = finishByTask.has(id) ? [...path, id] : path;
      const end = finishByTask.get(candidate.at(-1)) || '';
      if (!best.length || end > bestEnd || (end === bestEnd && candidate.length > best.length)) {
        best = candidate;
        bestEnd = end;
      }
    }
    if (finishByTask.has(id) && !best.includes(id)) best = [...best, id];
    memo.set(id, best);
    return best;
  }
  let global = [];
  let globalEnd = '';
  for (const id of ids) {
    if (!finishByTask.has(id)) continue;
    const path = visit(id);
    const end = finishByTask.get(id) || '';
    if (!global.length || end > globalEnd) {
      global = path;
      globalEnd = end;
    }
  }
  return global;
}

function runScheduleCapacity(container, options = {}) {
  const assignments = options.assignments || greedyAssignFromShortlists(
    container?.resource?.recommendations || [],
    { maxTasksPerUser: options.maxTasksPerUser || 12 }
  );
  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    assignments,
    ...packScheduleCapacity({
      tasks: container?.planning?.tasks || [],
      edges: container?.analyses?.dependency?.edges || [],
      assignments,
      projectStart: options.projectStart,
      projectDeadline: options.projectDeadline || options.deadline || null,
      meetingHoursByUserDay:
        options.meetingHoursByUserDay && typeof options.meetingHoursByUserDay === 'object'
          ? options.meetingHoursByUserDay
          : {},
      calendar: options.calendar,
    }),
  };
}

function taskDatesFromSchedule(schedule = []) {
  const byTask = new Map();
  for (const row of schedule || []) {
    const taskId = String(row?.taskId || '').trim();
    const dateKey = toDateKey(row?.dateKey);
    if (!taskId || !dateKey) continue;
    if (!byTask.has(taskId)) {
      byTask.set(taskId, { startDate: dateKey, dueDate: dateKey });
    } else {
      const current = byTask.get(taskId);
      if (dateKey < current.startDate) current.startDate = dateKey;
      if (dateKey > current.dueDate) current.dueDate = dateKey;
    }
  }
  return Object.fromEntries(byTask);
}

function applyScheduleCapacityToContainer(container, result) {
  const taskDates =
    result.taskDates &&
    typeof result.taskDates === 'object' &&
    Object.keys(result.taskDates).length
      ? result.taskDates
      : taskDatesFromSchedule(result.schedule);
  const next = {
    ...container,
    planning: {
      ...(container?.planning || {}),
      completion: result.completion,
      milestones: Array.isArray(result.milestones) ? result.milestones : [],
      tasks: (container?.planning?.tasks || []).map((task) => ({
        ...task,
        startDate:
          taskDates[String(task?.id || task?.taskId || '').trim()]?.startDate || null,
        dueDate:
          taskDates[String(task?.id || task?.taskId || '').trim()]?.dueDate || null,
      })),
    },
    resource: {
      ...(container?.resource || {}),
      assignments: result.assignments,
      schedule: result.schedule,
      capacityConflicts: Array.isArray(result.capacityConflicts)
        ? result.capacityConflicts
        : [],
    },
  };
  if (result.meta && typeof result.meta === 'object') {
    next.resource.assignmentsMeta = {
      ...(next.resource.assignmentsMeta || {}),
      ...result.meta,
    };
  }
  return next;
}

module.exports = {
  DAILY_CAP_HOURS,
  toDateKey,
  packScheduleCapacity,
  longestCalendarPath,
  taskDatesFromSchedule,
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
  utcNoon,
  nextWeekday: nextWorkingDay,
  holidaySet,
};
