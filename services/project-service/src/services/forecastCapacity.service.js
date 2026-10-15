const mongoose = require('../db');
const ProjectMember = require('../models/ProjectMember');
const Task = require('../models/Task');
const MeetingEvent = require('../models/MeetingEvent');
const {
  computeForecastDemandByWeek,
  buildAvailableHoursByWeek,
  projectForecastWithDelta,
} = require('../engines/allocation/forecastDemand');
const {
  availableCapacityHours,
  weekKeyFromDate,
  workloadPct,
} = require('../engines/allocation/capacity');
const {
  flattenSegments,
  allocatedPctOnDay,
  toDayMs,
} = require('../utils/staffing/allocationOverlap');
const { loadActiveBudgetsForUsers } = require('./roleEffortBudget.service');
const { isForecastCapacityV1Enabled } = require('../constants/roleEffortBudgetDefaults');
const { spreadHoursAcrossWeeks } = require('../engines/allocation/weekSpread');

function asOid(id) {
  const s = String(id || '').trim();
  return mongoose.isValidObjectId(s) ? s : '';
}

async function loadCalendarPack(organizationId) {
  try {
    const { fetchOrgWorkingCalendar } = require('../clients/orgStructure.client');
    const pack = await fetchOrgWorkingCalendar(String(organizationId));
    return {
      calendar: pack?.workingCalendar || { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      holidays: Array.isArray(pack?.holidays) ? pack.holidays : [],
      hasCalendar: Boolean(pack?.workingCalendar),
    };
  } catch {
    return {
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      holidays: [],
      hasCalendar: false,
    };
  }
}

function commitmentPctForUser(memberRows, asOfMs, availableHours) {
  const flat = flattenSegments(memberRows || []);
  const allocatedPct = allocatedPctOnDay(flat, asOfMs);
  if (!Number.isFinite(availableHours) || availableHours <= 0) {
    return { commitmentPct: allocatedPct, committedHours: null };
  }
  const committedHours = Math.round((allocatedPct / 100) * availableHours * 100) / 100;
  return { commitmentPct: allocatedPct, committedHours };
}

async function loadTaskPlannedForUser(userId, { fromMs, toMs } = {}) {
  const uid = asOid(userId);
  if (!uid) return [];
  const filter = {
    $or: [{ assigneeId: uid }, { 'assignees.userId': uid }],
  };
  if (fromMs != null && toMs != null) {
    filter.$and = [
      {
        $or: [
          { dueDate: { $gte: new Date(fromMs), $lte: new Date(toMs) } },
          { startDate: { $gte: new Date(fromMs), $lte: new Date(toMs) } },
        ],
      },
    ];
  }
  const tasks = await Task.find(filter)
    .select('estimateHours startDate dueDate assigneeId assignees')
    .lean()
    .catch(() => []);
  return (tasks || []).map((t) => ({
    effortHours: Number(t.estimateHours) || 0,
    startDate: t.startDate,
    dueDate: t.dueDate || t.startDate,
  }));
}

async function loadPlannedMeetingsForUser(userId, { fromMs, toMs } = {}) {
  const uid = asOid(userId);
  if (!uid) return [];
  const filter = {
    status: { $nin: ['cancelled'] },
    'participants.userId': uid,
  };
  if (fromMs != null && toMs != null) {
    filter.startAt = { $gte: new Date(fromMs), $lte: new Date(toMs) };
  }
  const events = await MeetingEvent.find(filter)
    .select('startAt endAt participants')
    .lean()
    .catch(() => []);
  return (events || []).map((e) => {
    const start = e.startAt ? new Date(e.startAt) : null;
    const end = e.endAt ? new Date(e.endAt) : null;
    const participant = (e.participants || []).find((p) => String(p.userId) === String(uid));
    let hours = null;
    if (participant?.plannedDurationMinutes != null) {
      hours = Number(participant.plannedDurationMinutes) / 60;
    } else if (start && end) {
      hours = Math.max(0, (end.getTime() - start.getTime()) / 3600000);
    }
    return {
      hours: Number.isFinite(hours) ? hours : 0,
      startAt: start,
      weekKey: start ? weekKeyFromDate(start) : null,
    };
  });
}

/**
 * Forecast capacity row for one user × optional week focus.
 */
async function getUserForecastCapacity({
  organizationId,
  userId,
  weekKey = null,
  projectId = null,
} = {}) {
  const orgId = asOid(organizationId);
  const uid = asOid(userId);
  if (!orgId || !uid) {
    const err = new Error('organizationId/userId bắt buộc');
    err.statusCode = 400;
    throw err;
  }

  const calPack = await loadCalendarPack(orgId);
  const focusWeek = weekKey || weekKeyFromDate(new Date());
  const weekStart = toDayMs(`${focusWeek}T00:00:00.000Z`);
  const fromMs = weekStart != null ? weekStart - 14 * 24 * 3600 * 1000 : null;
  const toMs = weekStart != null ? weekStart + 42 * 24 * 3600 * 1000 : null;

  const budgetsAll = await loadActiveBudgetsForUsers({
    organizationId: orgId,
    userIds: [uid],
  });
  const budgets = projectId
    ? budgetsAll.filter((b) => String(b.projectId) === String(projectId))
    : budgetsAll;

  const [tasks, meetings, memberRows] = await Promise.all([
    loadTaskPlannedForUser(uid, { fromMs, toMs }),
    loadPlannedMeetingsForUser(uid, { fromMs, toMs }),
    ProjectMember.find({ userId: uid, status: 'active' }).select('allocations projectId').lean(),
  ]);

  const forecast = computeForecastDemandByWeek({
    budgets,
    tasks,
    meetings,
    calendar: calPack.calendar,
    holidays: calPack.holidays,
  });

  const weekKeys = Object.keys(forecast.byWeek);
  if (!weekKeys.includes(focusWeek)) weekKeys.push(focusWeek);

  const availMap = buildAvailableHoursByWeek(weekKeys, {
    calendar: calPack.hasCalendar ? calPack.calendar : calPack.calendar,
    holidays: calPack.holidays,
    requireCalendar: false,
  });

  const cap = availableCapacityHours({
    weekKey: focusWeek,
    calendar: calPack.calendar,
    holidays: calPack.holidays,
    requireCalendar: !calPack.hasCalendar,
  });

  const weekRow = forecast.byWeek[focusWeek] || {
    unallocatedBudgetHours: 0,
    taskPlannedHours: 0,
    plannedMeetingHours: 0,
    forecastDemandHours: 0,
  };

  const availableHours =
    cap.availableHours != null
      ? cap.availableHours
      : availMap[focusWeek] != null
        ? availMap[focusWeek]
        : 40;

  const wl = workloadPct({
    demandHours: weekRow.forecastDemandHours,
    availableHours: cap.capacityStatus === 'missing_calendar' ? null : availableHours,
  });

  const commit = commitmentPctForUser(
    projectId
      ? memberRows.filter((r) => String(r.projectId) === String(projectId))
      : memberRows,
    weekStart ?? Date.now(),
    availableHours
  );

  return {
    userId: uid,
    organizationId: orgId,
    projectId: projectId || null,
    weekKey: focusWeek,
    availableHours: wl.availableHours,
    capacityStatus: cap.capacityStatus || 'ok',
    commitmentPct: commit.commitmentPct,
    committedHours: commit.committedHours,
    forecastWorkloadPct: wl.workloadPct,
    forecastDemandHours: weekRow.forecastDemandHours,
    breakdown: {
      unallocatedBudgetHours: weekRow.unallocatedBudgetHours,
      taskPlannedHours: weekRow.taskPlannedHours,
      plannedMeetingHours: weekRow.plannedMeetingHours,
    },
    actualWorkloadPct: null,
    actualStatus: 'insufficient_data',
    byWeek: forecast.byWeek,
    flagEnabled: isForecastCapacityV1Enabled(),
  };
}

/**
 * Map userId → forecastDemandHours by week (for snapshot / matching).
 */
async function buildForecastDemandByUserWeek({
  organizationId,
  userIds = [],
  fromMs,
  toMs,
} = {}) {
  const orgId = asOid(organizationId);
  const ids = [...new Set((userIds || []).map(String).filter((id) => mongoose.isValidObjectId(id)))];
  if (!orgId || !ids.length) return {};

  const calPack = await loadCalendarPack(orgId);
  const budgetsAll = await loadActiveBudgetsForUsers({ organizationId: orgId, userIds: ids });
  const out = {};

  for (const uid of ids) {
    const budgets = budgetsAll.filter((b) => String(b.userId) === String(uid));
    const [tasks, meetings] = await Promise.all([
      loadTaskPlannedForUser(uid, { fromMs, toMs }),
      loadPlannedMeetingsForUser(uid, { fromMs, toMs }),
    ]);
    const forecast = computeForecastDemandByWeek({
      budgets,
      tasks,
      meetings,
      calendar: calPack.calendar,
      holidays: calPack.holidays,
    });
    for (const [wk, row] of Object.entries(forecast.byWeek)) {
      out[`${uid}|${wk}`] = row.forecastDemandHours;
    }
  }
  return out;
}

/**
 * Remaining capacity % for matching pool (100 - forecastWorkloadPct), clamped.
 */
async function enrichPoolItemsWithForecast(poolItems = [], { organizationId, weekKey = null } = {}) {
  if (!isForecastCapacityV1Enabled()) return poolItems;
  const orgId = asOid(organizationId);
  if (!orgId) return poolItems;
  const focusWeek = weekKey || weekKeyFromDate(new Date());
  const enriched = [];
  for (const item of poolItems) {
    const uid = String(item.userId || item.id || '');
    if (!mongoose.isValidObjectId(uid)) {
      enriched.push(item);
      continue;
    }
    try {
      const row = await getUserForecastCapacity({
        organizationId: orgId,
        userId: uid,
        weekKey: focusWeek,
      });
      const forecastPct = Number(row.forecastWorkloadPct);
      const remaining =
        Number.isFinite(forecastPct) ? Math.max(0, Math.min(100, 100 - forecastPct)) : null;
      enriched.push({
        ...item,
        forecastWorkloadPct: row.forecastWorkloadPct,
        forecastDemandHours: row.forecastDemandHours,
        forecastBreakdown: row.breakdown,
        availablePct: remaining != null ? remaining : item.availablePct,
        capacityRemaining: remaining != null ? remaining / 100 : item.capacityRemaining,
        capacityStatus: row.capacityStatus,
        actualStatus: row.actualStatus,
      });
    } catch {
      enriched.push(item);
    }
  }
  return enriched;
}

/**
 * Hard-gate helper: would adding effortHours for user stay ≤100%?
 */
async function evaluateAssignmentFeasibility({
  organizationId,
  userId,
  effortHours,
  startDate,
  endDate,
} = {}) {
  const row = await getUserForecastCapacity({ organizationId, userId });
  const hours = Math.max(0, Number(effortHours) || 0);
  const deltaMap = spreadHoursAcrossWeeks({
    totalHours: hours,
    startDate: startDate || new Date(),
    endDate: endDate || startDate || new Date(),
  });
  const existingByWeek = {};
  for (const [wk, data] of Object.entries(row.byWeek || {})) {
    existingByWeek[wk] = data;
  }
  const avail = {};
  for (const wk of new Set([...Object.keys(existingByWeek), ...Object.keys(deltaMap)])) {
    const cap = availableCapacityHours({
      weekKey: wk,
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
    });
    avail[wk] = cap.availableHours;
  }
  return projectForecastWithDelta({
    existingByWeek,
    deltaHoursByWeek: deltaMap,
    availableHoursByWeek: avail,
    overloadPct: 100,
  });
}

/** Best-effort recompute marker after assignments (ledger is derived — invalidate caches later). */
async function recomputeForecastForUsers({ organizationId, userIds = [] } = {}) {
  const orgId = asOid(organizationId);
  const ids = [...new Set((userIds || []).map(String).filter(Boolean))];
  if (!orgId || !ids.length) return { recomputed: 0 };
  const rows = [];
  for (const uid of ids) {
    try {
      const row = await getUserForecastCapacity({ organizationId: orgId, userId: uid });
      rows.push({
        userId: uid,
        weekKey: row.weekKey,
        forecastWorkloadPct: row.forecastWorkloadPct,
        forecastDemandHours: row.forecastDemandHours,
      });
    } catch {
      /* skip */
    }
  }
  return { recomputed: rows.length, rows };
}

module.exports = {
  getUserForecastCapacity,
  buildForecastDemandByUserWeek,
  enrichPoolItemsWithForecast,
  evaluateAssignmentFeasibility,
  recomputeForecastForUsers,
  loadCalendarPack,
};
