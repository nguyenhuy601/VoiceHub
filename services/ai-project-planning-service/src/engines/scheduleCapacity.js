/**
 * Ported from project-service/src/utils/aiAnalysis/aiAnalysisScheduleCapacity.js.
 */
const { greedyAssignFromShortlists } = require('./assignment');
const { buildTaskGraph } = require('./sequencingCpm');
const { levelScheduleAroundCriticalPath } = require('./scheduleFloatLeveling');
const { buildSchedulePlan } = require('./sprintReleasePlan');

const DAILY_CAP_HOURS = 8;
/** Place at least one working day when leaf effort is missing/0 so Gate2 Lịch is not empty. */
const DEFAULT_LEAF_SCHEDULE_HOURS = DAILY_CAP_HOURS;
const UNASSIGNED_SCHEDULE_USER_ID = 'UNASSIGNED';
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

/** Prefer explicit start → calendar → today (VN). Never return null when scheduling. */
function resolveScheduleProjectStart(projectStart, calendar = null) {
  const fromProject = toDateKey(projectStart);
  if (fromProject) return { startKey: fromProject, source: 'project' };
  const fromCalendar = toDateKey(
    calendar?.startDate || calendar?.projectStart || calendar?.start || null
  );
  if (fromCalendar) return { startKey: fromCalendar, source: 'calendar' };
  const today = new Date(Date.now() + VN_OFFSET_MS).toISOString().slice(0, 10);
  return { startKey: today, source: 'today_fallback' };
}

/**
 * Pad missing leaf assignments with UNASSIGNED so CPM still stamps dates.
 * Does not invent people — real assignments stay authoritative for Phân công.
 */
function padUnassignedLeafAssignments(tasks = [], assignments = []) {
  const byTask = new Map(
    (assignments || [])
      .map((item) => [String(item?.taskId || '').trim(), item])
      .filter(([id]) => id)
  );
  const padded = [...(assignments || [])];
  let paddedCount = 0;
  for (const task of tasks || []) {
    if (!isLeafTaskForSchedule(task)) continue;
    const id = String(task?.id || task?.taskId || '').trim();
    if (!id || byTask.has(id)) continue;
    const row = {
      taskId: id,
      userId: UNASSIGNED_SCHEDULE_USER_ID,
      displayName: 'Unassigned',
      unassigned: true,
      rationale: 'schedule_placeholder_unassigned',
    };
    padded.push(row);
    byTask.set(id, row);
    paddedCount += 1;
  }
  return { assignments: padded, paddedCount };
}

function effortHoursForSchedule(task) {
  const raw = Number(task?.effortHours ?? task?.effortSeedHours);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_LEAF_SCHEDULE_HOURS;
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
  return (
    level !== 'epic' &&
    level !== 'feature' &&
    level !== 'story' &&
    level !== 'work_package'
  );
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
  const { startKey, source: projectStartSource } = resolveScheduleProjectStart(
    projectStart,
    calendar
  );
  const deadlineKey = toDateKey(projectDeadline);
  const { assignments: effectiveAssignments, paddedCount: unassignedPadCount } =
    padUnassignedLeafAssignments(tasks, assignments);
  const assignmentByTask = new Map(
    effectiveAssignments.map((item) => [String(item.taskId), item])
  );
  const schedulableTasks = (tasks || []).filter((task) => {
    const id = String(task.id || task.taskId || '');
    if (!id || !assignmentByTask.has(id)) return false;
    return isLeafTaskForSchedule(task);
  });
  const taskById = new Map(
    schedulableTasks.map((task) => [String(task.id || task.taskId), task])
  );

  const start = nextWorkingDay(startKey, calendar);
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
    const aH = effortHoursForSchedule(taskById.get(a));
    const bH = effortHoursForSchedule(taskById.get(b));
    if (bH !== aH) return bH - aH;
    return a.localeCompare(b);
  }

  let guard = 0;
  let defaultEffortAppliedCount = 0;
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
      const taskRow = taskById.get(taskId);
      const rawEffort = Number(taskRow?.effortHours ?? taskRow?.effortSeedHours);
      if (!(Number.isFinite(rawEffort) && rawEffort > 0)) defaultEffortAppliedCount += 1;
      let remaining = effortHoursForSchedule(taskRow);
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
      unassignedTaskIds: [...taskById.keys()].filter((id) => {
        const row = assignmentByTask.get(id);
        return !row || row.unassigned === true || row.userId === UNASSIGNED_SCHEDULE_USER_ID;
      }),
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
      projectStartSource,
      unassignedPadCount,
      defaultEffortAppliedCount,
      reason:
        schedule.length === 0
          ? schedulableTasks.length === 0
            ? 'no_leaf_tasks'
            : 'schedule_empty'
          : unassignedPadCount > 0
            ? 'partial_unassigned'
            : null,
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
  const sequencingStatus = String(container?.planning?.sequence?.status || '');
  const sequencingBlocked = sequencingStatus.startsWith('BLOCKED');
  if (
    !sequencingBlocked &&
    (!theoreticalCpm || !Array.isArray(theoreticalCpm.nodes || theoreticalCpm.tasks))
  ) {
    try {
      const { runSequencingCpm } = require('./sequencingCpm');
      const seq = runSequencingCpm(container);
      theoreticalCpm = seq.status === 'READY' ? seq.theoreticalCpm : null;
    } catch {
      theoreticalCpm = theoreticalCpm || null;
    }
  }

  const criticalWorkIds =
    options.criticalWorkIds ||
    container?.planning?.criticalWorkIds ||
    theoreticalCpm?.criticalPath ||
    [];

  const realAssignments = options.assignments || greedyAssignFromShortlists(
    container?.resource?.recommendations || [],
    {
      maxTasksPerUser: options.maxTasksPerUser || 12,
      tasks: container?.planning?.tasks || [],
      featureOwners: container?.resource?.featureOwners || [],
      criticalWorkIds,
      policy: options.policy || null,
      globalAssign:
        options.globalAssign ||
        options.policy?.globalAssign ||
        container?.resource?.matching?.assignmentPolicy?.globalAssign ||
        null,
    }
  );
  // Pack may pad UNASSIGNED for date stamps; keep resource.assignments people-only.
  const packed = packScheduleCapacity({
    tasks: container?.planning?.tasks || [],
    edges: container?.analyses?.dependency?.edges || [],
    assignments: realAssignments,
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
    assignments: realAssignments,
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
  // Enrich capacityPlan (from Matching) with schedule hard-conflict counts — Step 5
  const conflicts = Array.isArray(result.capacityConflicts) ? result.capacityConflicts : [];
  const hardConflictCount = conflicts.filter((c) =>
    ['zero_capacity_day', 'unresolved_effort', 'past_deadline'].includes(String(c?.type || ''))
  ).length;
  const prevPlan =
    next.resource.capacityPlan && typeof next.resource.capacityPlan === 'object'
      ? next.resource.capacityPlan
      : {};
  next.resource.capacityPlan = {
    ...prevPlan,
    scheduleConflictCount: conflicts.length,
    hardCapacityConflictCount: hardConflictCount,
    hardGate:
      Boolean(prevPlan.hardGate) || hardConflictCount > 0 || Boolean(prevPlan.totalGapHours > 0),
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
  // Step 6 — bucket sprints / releases into planning.schedulePlan
  const schedulePlan = buildSchedulePlan({
    completion: result.completion,
    taskDates,
    tasks: next.planning.tasks,
    milestones: result.milestones,
    capacityConflicts: result.capacityConflicts,
    capacityPlan: next.resource.capacityPlan,
  });
  next.planning.schedulePlan = schedulePlan;
  if (Array.isArray(schedulePlan.milestones)) {
    next.planning.milestones = schedulePlan.milestones;
  }
  return next;
}

module.exports = {
  DAILY_CAP_HOURS,
  DEFAULT_LEAF_SCHEDULE_HOURS,
  UNASSIGNED_SCHEDULE_USER_ID,
  isLeafTaskForSchedule,
  toDateKey,
  resolveScheduleProjectStart,
  padUnassignedLeafAssignments,
  effortHoursForSchedule,
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
