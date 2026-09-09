/**
 * Schedule & capacity packing (engine-only).
 * Daily cap: 8h = work hours + meetingHours (meetingHours default 0).
 */

const { greedyAssignFromShortlists } = require('./aiAnalysisAssignment');
const { buildTaskGraph } = require('./aiAnalysisSequencingCpm');

const DAILY_CAP_HOURS = 8;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function toDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function utcNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function addDays(dateKey, n) {
  const d = utcNoon(dateKey);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isWeekday(dateKey) {
  const dow = utcNoon(dateKey).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function nextWeekday(dateKey) {
  let cur = dateKey;
  for (let i = 0; i < 14; i += 1) {
    if (isWeekday(cur)) return cur;
    cur = addDays(cur, 1);
  }
  return cur;
}

function advanceWeekday(dateKey) {
  return nextWeekday(addDays(dateKey, 1));
}

/** Hook — no meeting source yet; always 0 unless opts override map. */
function getMeetingHoursForUserDay(userId, dateKey, opts = {}) {
  const map = opts.meetingHoursByUserDay;
  if (!map || typeof map !== 'object') return 0;
  const key = `${userId}|${dateKey}`;
  const n = Number(map[key] ?? map[dateKey]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function taskEffort(task) {
  const n = Number(task?.effortHours);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function predecessorsDone(taskId, preds, finished) {
  for (const p of preds.get(taskId) || []) {
    if (!finished.has(p)) return false;
  }
  return true;
}

/**
 * Pack assignments into daily hours under 8h cap (work + meetings).
 */
function packScheduleCapacity({
  tasks = [],
  edges = [],
  assignments = [],
  projectStart = null,
  meetingHoursByUserDay = null,
} = {}) {
  const startKey = nextWeekday(toDateKey(projectStart) || toDateKey(new Date()) || '1970-01-01');
  const taskById = new Map();
  for (const t of tasks) {
    const id = String(t?.id || t?.taskId || '').trim();
    if (id) taskById.set(id, t);
  }

  const { preds, succs } = buildTaskGraph([...taskById.values()], edges);
  const assignByTask = new Map();
  for (const a of assignments || []) {
    const tid = String(a.taskId || '').trim();
    const uid = String(a.userId || '').trim();
    if (tid && uid) assignByTask.set(tid, a);
  }

  const usedByUserDay = new Map(); // `${userId}|${date}` → work hours packed
  const schedule = [];
  const finished = new Set();
  const finishEf = new Map(); // taskId → end hour offset approx (for path)
  const startEs = new Map();

  const pending = new Set([...taskById.keys()].filter((id) => assignByTask.has(id)));
  // Tasks without assignee: skip packing but mark unresolved
  const unassigned = [...taskById.keys()].filter((id) => !assignByTask.has(id));

  let guard = 0;
  const maxIter = pending.size * 40 + 10;

  while (pending.size && guard < maxIter) {
    guard += 1;
    let progressed = false;

    for (const taskId of [...pending].sort()) {
      if (!predecessorsDone(taskId, preds, finished)) continue;

      const assign = assignByTask.get(taskId);
      const userId = assign.userId;
      let remaining = taskEffort(taskById.get(taskId));
      if (remaining <= 0) {
        finished.add(taskId);
        pending.delete(taskId);
        startEs.set(taskId, 0);
        finishEf.set(taskId, 0);
        progressed = true;
        continue;
      }

      let predReadyDay = startKey;
      for (const p of preds.get(taskId) || []) {
        const rows = schedule.filter((r) => r.taskId === p);
        for (const r of rows) {
          if (r.dateKey > predReadyDay) predReadyDay = r.dateKey;
        }
      }
      let day = nextWeekday(predReadyDay);
      // If pred finished same day, can continue same day if remaining capacity
      const dayHours = [];

      let dayGuard = 0;
      while (remaining > 0 && dayGuard < 366) {
        dayGuard += 1;
        const meet = getMeetingHoursForUserDay(userId, day, { meetingHoursByUserDay });
        const usedKey = `${userId}|${day}`;
        const used = usedByUserDay.get(usedKey) || 0;
        const remainingCap = Math.max(0, DAILY_CAP_HOURS - meet - used);
        if (remainingCap <= 0) {
          day = advanceWeekday(day);
          continue;
        }
        const chunk = Math.min(remaining, remainingCap);
        usedByUserDay.set(usedKey, used + chunk);
        dayHours.push({ dateKey: day, hours: chunk, meetingHours: meet });
        remaining -= chunk;
        if (remaining > 0) day = advanceWeekday(day);
      }

      for (const row of dayHours) {
        schedule.push({
          taskId,
          userId,
          displayName: assign.displayName || undefined,
          dateKey: row.dateKey,
          hours: Math.round(row.hours * 100) / 100,
          meetingHours: row.meetingHours,
          dailyCap: DAILY_CAP_HOURS,
          usedAfter:
            Math.round(
              ((usedByUserDay.get(`${userId}|${row.dateKey}`) || 0) + row.meetingHours) * 100
            ) / 100,
        });
      }

      if (dayHours.length) {
        startEs.set(taskId, dayHours[0].dateKey);
        finishEf.set(taskId, dayHours[dayHours.length - 1].dateKey);
      }
      finished.add(taskId);
      pending.delete(taskId);
      progressed = true;
    }

    if (!progressed) break;
  }

  let estimatedEnd = startKey;
  for (const row of schedule) {
    if (row.dateKey > estimatedEnd) estimatedEnd = row.dateKey;
  }

  // Longest predecessor chain by calendar finish date among assigned tasks
  const criticalPath = longestCalendarPath([...taskById.keys()], preds, finishEf);

  const totalEffort = [...taskById.values()].reduce((s, t) => s + taskEffort(t), 0);

  return {
    schedule,
    completion: {
      projectStart: startKey,
      estimatedEnd,
      totalEffortHours: Math.round(totalEffort * 100) / 100,
      criticalPath,
      dailyCapHours: DAILY_CAP_HOURS,
      unassignedTaskIds: unassigned,
      unresolvedPending: [...pending],
    },
    meta: {
      source: 'engine',
      llmCalls: 0,
      scheduleRowCount: schedule.length,
    },
  };
}

function longestCalendarPath(ids, preds, finishEf) {
  const memo = new Map();

  function dfs(id) {
    if (memo.has(id)) return memo.get(id);
    const predList = [...(preds.get(id) || [])];
    if (!predList.length) {
      const path = finishEf.has(id) ? [id] : [];
      memo.set(id, path);
      return path;
    }
    let best = [];
    let bestEnd = '';
    for (const p of predList) {
      const path = dfs(p);
      const end = finishEf.get(id) || finishEf.get(p) || '';
      const cand = finishEf.has(id) ? [...path, id] : path;
      const candEnd = finishEf.get(cand[cand.length - 1]) || end;
      if (!best.length || candEnd > bestEnd || (candEnd === bestEnd && cand.length > best.length)) {
        best = cand;
        bestEnd = candEnd;
      }
    }
    if (finishEf.has(id) && !best.includes(id)) best = [...best, id];
    memo.set(id, best);
    return best;
  }

  let global = [];
  let globalEnd = '';
  for (const id of ids) {
    if (!finishEf.has(id)) continue;
    const path = dfs(id);
    const end = finishEf.get(id) || '';
    if (!global.length || end > globalEnd) {
      global = path;
      globalEnd = end;
    }
  }
  return global;
}

function runScheduleCapacity(container, opts = {}) {
  const recommendations = container?.resource?.recommendations || [];
  const assignments =
    opts.assignments ||
    greedyAssignFromShortlists(recommendations, {
      maxTasksPerUser: opts.maxTasksPerUser || 12,
    });

  const packed = packScheduleCapacity({
    tasks: container?.planning?.tasks || [],
    edges: container?.analyses?.dependency?.edges || [],
    assignments,
    projectStart: opts.projectStart,
    meetingHoursByUserDay: opts.meetingHoursByUserDay,
  });

  return {
    status: 'ready',
    model: null,
    generatedAt: new Date().toISOString(),
    assignments,
    schedule: packed.schedule,
    completion: packed.completion,
    meta: packed.meta,
  };
}

function applyScheduleCapacityToContainer(container, result) {
  const next = {
    ...container,
    planning: { ...container.planning },
    resource: { ...container.resource },
  };
  next.resource.assignments = result.assignments || [];
  next.resource.schedule = result.schedule || [];
  next.planning.completion = result.completion || null;
  return next;
}

function buildExecutionPlanFromContainer(container) {
  const c = container || {};
  const completion = c.planning?.completion || null;
  const schedule = c.resource?.schedule || [];
  const assignments = c.resource?.assignments || [];
  const byTask = new Map();
  for (const row of schedule) {
    const tid = String(row.taskId || '');
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

  return {
    projectStart: completion?.projectStart || null,
    estimatedEnd: completion?.estimatedEnd || null,
    totalEffortHours: completion?.totalEffortHours ?? null,
    criticalPath: completion?.criticalPath || [],
    assignments,
    works: [...byTask.values()],
    generatedAt: new Date().toISOString(),
  };
}

function applyProjectPlanToContainer(container, executionPlan) {
  const next = {
    ...container,
    planning: { ...container.planning },
  };
  next.planning.executionPlan = executionPlan || null;
  return next;
}

module.exports = {
  DAILY_CAP_HOURS,
  getMeetingHoursForUserDay,
  packScheduleCapacity,
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
  buildExecutionPlanFromContainer,
  applyProjectPlanToContainer,
  toDateKey,
  nextWeekday,
};
