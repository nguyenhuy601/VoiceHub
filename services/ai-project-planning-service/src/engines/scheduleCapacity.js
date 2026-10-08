/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisScheduleCapacity.js.
 */
const { greedyAssignFromShortlists } = require('./assignment');
const { buildTaskGraph } = require('./sequencingCpm');
const { levelScheduleAroundCriticalPath } = require('./scheduleFloatLeveling');

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

function isLeafTaskForSchedule(task) {
  const level = String(task?.level || 'task').toLowerCase();
  return level !== 'epic' && level !== 'feature' && level !== 'story';
}

/** Critical ids from CPM + explicit list — used for ready-queue priority. */
function resolveCriticalTaskIds({ criticalWorkIds = [], theoreticalCpm = null, tasks = [] } = {}) {
  const ids = new Set((criticalWorkIds || []).map(String).filter(Boolean));
  const cpm = theoreticalCpm || {};
  for (const id of cpm.criticalPath || []) ids.add(String(id));
  const nodes = Array.isArray(cpm.tasks)
    ? cpm.tasks
    : Array.isArray(cpm.nodes)
      ? cpm.nodes
      : [];
  for (const node of nodes) {
    const id = String(node.id || node.workId || node.taskId || '');
    if (!id) continue;
    const totalFloat = Number(node.totalFloat);
    if (node.critical === true || node.isCritical === true || totalFloat === 0) {
      ids.add(id);
    }
  }
  for (const task of tasks || []) {
    const id = String(task?.id || task?.taskId || '');
    if (!id) continue;
    if (task.critical === true || task.isCritical === true) ids.add(id);
  }
  return ids;
}

function lateFinishByTask(theoreticalCpm) {
  const map = new Map();
  const cpm = theoreticalCpm || {};
  const nodes = Array.isArray(cpm.tasks)
    ? cpm.tasks
    : Array.isArray(cpm.nodes)
      ? cpm.nodes
      : [];
  for (const node of nodes) {
    const id = String(node.id || node.workId || node.taskId || '');
    if (!id) continue;
    const lf = Number(node.lateFinish ?? node.LF ?? node.lf);
    if (Number.isFinite(lf)) map.set(id, lf);
  }
  return map;
}

function packScheduleCapacity({
  tasks = [],
  edges = [],
  assignments = [],
  projectStart,
  projectDeadline = null,
  meetingHoursByUserDay = null,
  calendar = null,
  criticalWorkIds = [],
  theoreticalCpm = null,
} = {}) {
  const start = nextWorkingDay(toDateKey(projectStart) || toDateKey(new Date()), calendar);
  const deadlineKey = toDateKey(projectDeadline);
  const assignmentByTask = new Map(assignments.map((item) => [String(item.taskId), item]));
  const schedulableTasks = (tasks || []).filter((task) => {
    const id = String(task.id || task.taskId || '');
    if (!id || !assignmentByTask.has(id)) return false;
    return isLeafTaskForSchedule(task);
  });
  const taskById = new Map(
    schedulableTasks.map((task) => [String(task.id || task.taskId), task])
  );
  const criticalIds = resolveCriticalTaskIds({
    criticalWorkIds,
    theoreticalCpm,
    tasks: schedulableTasks,
  });
  const lfByTask = lateFinishByTask(theoreticalCpm);
  const { preds } = buildTaskGraph(schedulableTasks, edges);
  const pending = new Set([...taskById.keys()]);
  const finished = new Set();
  const finishByTask = new Map();
  const used = new Map();
  const schedule = [];
  const taskDates = {};
  const capacityConflicts = [];

  function compareReady(a, b) {
    // Critical-path first (standard RCPSP heuristic), then earliest late-finish, then id
    const aC = criticalIds.has(a) ? 0 : 1;
    const bC = criticalIds.has(b) ? 0 : 1;
    if (aC !== bC) return aC - bC;
    const aLf = lfByTask.has(a) ? lfByTask.get(a) : Number.POSITIVE_INFINITY;
    const bLf = lfByTask.has(b) ? lfByTask.get(b) : Number.POSITIVE_INFINITY;
    if (aLf !== bLf) return aLf - bLf;
    const aH = Number(taskById.get(a)?.effortHours) || 0;
    const bH = Number(taskById.get(b)?.effortHours) || 0;
    if (bH !== aH) return bH - aH;
    return a.localeCompare(b);
  }

  let guard = 0;
  const maxIterations = pending.size * 40 + 10;
  while (pending.size && guard < maxIterations) {
    guard += 1;
    let progressed = false;
    const ready = [...pending]
      .filter((taskId) => {
        const blockingPreds = [...(preds.get(taskId) || [])].filter((id) => taskById.has(id));
        return !blockingPreds.some((id) => !finished.has(id));
      })
      .sort(compareReady);

    for (const taskId of ready) {
      if (!pending.has(taskId)) continue;
      const blockingPreds = [...(preds.get(taskId) || [])].filter((id) => taskById.has(id));
      const assignment = assignmentByTask.get(taskId);
      let remaining = Math.max(0, Number(taskById.get(taskId)?.effortHours) || 0);
      let day = start;
      for (const predecessor of blockingPreds) {
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
              critical: criticalIds.has(taskId),
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
          ...(criticalIds.has(taskId) ? { critical: true } : {}),
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
          critical: criticalIds.has(taskId),
        });
      }
      if (firstDay) {
        taskDates[taskId] = {
          startDate: firstDay,
          dueDate: day,
          ...(criticalIds.has(taskId) ? { critical: true } : {}),
        };
      }
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
      criticalTaskCount: [...criticalIds].filter((id) => taskById.has(id)).length,
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
  let theoreticalCpm = container?.planning?.theoreticalCpm || options.theoreticalCpm || null;
  if (!theoreticalCpm || !Array.isArray(theoreticalCpm.nodes || theoreticalCpm.tasks)) {
    try {
      const { runSequencingCpm } = require('./sequencingCpm');
      const seq = runSequencingCpm(container);
      theoreticalCpm = seq.theoreticalCpm;
    } catch {
      theoreticalCpm = theoreticalCpm || null;
    }
  }

  const criticalWorkIds =
    options.criticalWorkIds ||
    container?.planning?.criticalWorkIds ||
    theoreticalCpm?.criticalPath ||
    [];

  const assignments = options.assignments || greedyAssignFromShortlists(
    container?.resource?.recommendations || [],
    {
      maxTasksPerUser: options.maxTasksPerUser || 12,
      tasks: container?.planning?.tasks || [],
      featureOwners: container?.resource?.featureOwners || [],
      criticalWorkIds,
    }
  );
  const packed = packScheduleCapacity({
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
    criticalWorkIds,
    theoreticalCpm,
  });

  const pastDeadline = (packed.capacityConflicts || []).some((c) => c.type === 'past_deadline');

  const leveled = levelScheduleAroundCriticalPath({
    schedule: packed.schedule,
    taskDates: packed.taskDates,
    theoreticalCpm,
    completion: packed.completion,
    dailyCapHours: DAILY_CAP_HOURS,
    pastDeadline,
    projectDeadline: packed.completion?.deadline || null,
  });

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    assignments,
    schedule: leveled.schedule,
    taskDates: leveled.taskDates,
    capacityConflicts: packed.capacityConflicts,
    milestones: packed.milestones,
    completion: leveled.completion,
    theoreticalCpm,
    meta: {
      ...packed.meta,
      leveledCount: leveled.leveledCount || 0,
      pastDeadline,
    },
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
      tasks: (container?.planning?.tasks || []).map((task) => {
        const tid = String(task?.id || task?.taskId || '').trim();
        const dates = taskDates[tid] || {};
        return {
          ...task,
          startDate: dates.startDate || null,
          dueDate: dates.dueDate || null,
          ...(dates.leveled ? { leveled: true } : {}),
        };
      }),
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
  if (result.theoreticalCpm && !next.planning.theoreticalCpm) {
    next.planning.theoreticalCpm = result.theoreticalCpm;
  }
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
  isLeafTaskForSchedule,
  toDateKey,
  packScheduleCapacity,
  longestCalendarPath,
  taskDatesFromSchedule,
  resolveCriticalTaskIds,
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
  utcNoon,
  nextWeekday: nextWorkingDay,
  holidaySet,
};
