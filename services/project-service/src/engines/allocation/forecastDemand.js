/**
 * Forecast demand pure engine (Wave 1).
 * Forecast demand = UnallocatedBudget + TaskPlanned + PlannedMeeting (anti-dup).
 * RULE-CAP-01: meetings only in numerator — never subtract from available capacity here.
 */

const { weekKeyFromDate, availableCapacityHours, workloadPct } = require('./capacity');
const {
  spreadHoursAcrossWeeks,
  spreadHoursPerWeekAcrossPhase,
} = require('./weekSpread');

function addHoursMap(target, source) {
  for (const [k, v] of Object.entries(source || {})) {
    const n = Number(v) || 0;
    if (!(n > 0)) continue;
    target[k] = Math.round(((Number(target[k]) || 0) + n) * 100) / 100;
  }
  return target;
}

/**
 * Build week → unallocated budget hours from budget rows.
 * @param {Array<{ residualHoursPerWeek, hoursPerWeek, phaseStartDate, phaseEndDate, spreadPolicy }>} budgets
 */
function budgetHoursByWeek(budgets = [], { calendar = {}, holidays = [] } = {}) {
  const out = {};
  for (const row of budgets || []) {
    const residual =
      row.residualHoursPerWeek != null
        ? Number(row.residualHoursPerWeek)
        : Number(row.hoursPerWeek) || 0;
    if (!(residual > 0)) continue;
    const map = spreadHoursPerWeekAcrossPhase({
      hoursPerWeek: residual,
      phaseStartDate: row.phaseStartDate || row.startDate,
      phaseEndDate: row.phaseEndDate || row.endDate,
      calendar,
      holidays,
    });
    addHoursMap(out, map);
  }
  return out;
}

/**
 * Task planned effort spread by schedule window.
 * @param {Array<{ effortHours, startDate, dueDate|endDate }>} tasks
 */
function taskPlannedHoursByWeek(tasks = [], { calendar = {}, holidays = [] } = {}) {
  const out = {};
  for (const task of tasks || []) {
    const hours = Number(task.effortHours ?? task.effortSeedHours) || 0;
    if (!(hours > 0)) continue;
    const start = task.startDate || task.plannedStart || null;
    const end = task.dueDate || task.endDate || task.plannedEnd || start;
    if (!start) {
      const key = weekKeyFromDate(new Date());
      if (key) out[key] = Math.round(((Number(out[key]) || 0) + hours) * 100) / 100;
      continue;
    }
    const map = spreadHoursAcrossWeeks({
      totalHours: hours,
      startDate: start,
      endDate: end,
      spreadPolicy: 'even_weeks',
      calendar,
      holidays,
    });
    addHoursMap(out, map);
  }
  return out;
}

/**
 * Planned meeting hours by week (already keyed or with start datetime).
 * @param {Array<{ hours, weekKey, startAt }>} meetings
 */
function plannedMeetingHoursByWeek(meetings = [], { tzOffsetHours = 7 } = {}) {
  const out = {};
  for (const m of meetings || []) {
    const hours = Number(m.hours ?? m.plannedHours ?? m.forecastDemandMeet) || 0;
    if (!(hours > 0)) continue;
    let key = m.weekKey || null;
    if (!key && m.startAt) key = weekKeyFromDate(m.startAt, { tzOffsetHours });
    if (!key) continue;
    out[key] = Math.round(((Number(out[key]) || 0) + hours) * 100) / 100;
  }
  return out;
}

/**
 * Merge sources for one user (or already scoped rows).
 * @returns {{ byWeek: Record<string, { unallocatedBudgetHours, taskPlannedHours, plannedMeetingHours, forecastDemandHours }>, totals }}
 */
function computeForecastDemandByWeek({
  budgets = [],
  tasks = [],
  meetings = [],
  calendar = {},
  holidays = [],
  tzOffsetHours = 7,
} = {}) {
  const budgetMap = budgetHoursByWeek(budgets, { calendar, holidays });
  const taskMap = taskPlannedHoursByWeek(tasks, { calendar, holidays });
  const meetMap = plannedMeetingHoursByWeek(meetings, { tzOffsetHours });

  const keys = new Set([
    ...Object.keys(budgetMap),
    ...Object.keys(taskMap),
    ...Object.keys(meetMap),
  ]);

  const byWeek = {};
  let totalDemand = 0;
  let totalBudget = 0;
  let totalTask = 0;
  let totalMeet = 0;

  for (const weekKey of [...keys].sort()) {
    const unallocatedBudgetHours = Math.round((Number(budgetMap[weekKey]) || 0) * 100) / 100;
    const taskPlannedHours = Math.round((Number(taskMap[weekKey]) || 0) * 100) / 100;
    const plannedMeetingHours = Math.round((Number(meetMap[weekKey]) || 0) * 100) / 100;
    const forecastDemandHours =
      Math.round((unallocatedBudgetHours + taskPlannedHours + plannedMeetingHours) * 100) / 100;
    byWeek[weekKey] = {
      unallocatedBudgetHours,
      taskPlannedHours,
      plannedMeetingHours,
      forecastDemandHours,
    };
    totalDemand += forecastDemandHours;
    totalBudget += unallocatedBudgetHours;
    totalTask += taskPlannedHours;
    totalMeet += plannedMeetingHours;
  }

  return {
    byWeek,
    totals: {
      forecastDemandHours: Math.round(totalDemand * 100) / 100,
      unallocatedBudgetHours: Math.round(totalBudget * 100) / 100,
      taskPlannedHours: Math.round(totalTask * 100) / 100,
      plannedMeetingHours: Math.round(totalMeet * 100) / 100,
    },
  };
}

/**
 * Projected forecast after adding delta effort hours (matching hard-gate).
 * @returns {{ feasible: boolean, reasons: string[], byWeek: object }}
 */
function projectForecastWithDelta({
  existingByWeek = {},
  deltaHoursByWeek = {},
  availableHoursByWeek = {},
  overloadPct = 100,
} = {}) {
  const keys = new Set([
    ...Object.keys(existingByWeek || {}),
    ...Object.keys(deltaHoursByWeek || {}),
  ]);
  const byWeek = {};
  const reasons = [];
  let feasible = true;

  for (const weekKey of keys) {
    const existing = existingByWeek[weekKey];
    const baseDemand =
      typeof existing === 'object' && existing != null
        ? Number(existing.forecastDemandHours) || 0
        : Number(existing) || 0;
    const delta = Number(deltaHoursByWeek[weekKey]) || 0;
    const demand = Math.round((baseDemand + delta) * 100) / 100;
    const avail = Number(availableHoursByWeek[weekKey]);
    const pctRow = workloadPct({
      demandHours: demand,
      availableHours: Number.isFinite(avail) ? avail : null,
    });
    byWeek[weekKey] = {
      forecastDemandHours: demand,
      availableHours: pctRow.availableHours,
      forecastWorkloadPct: pctRow.workloadPct,
    };
    if (pctRow.workloadPct == null) {
      feasible = false;
      reasons.push('missing_calendar');
    } else if (pctRow.workloadPct > Number(overloadPct)) {
      feasible = false;
      reasons.push('forecast_overload');
    }
  }

  return {
    feasible,
    reasons: [...new Set(reasons)],
    byWeek,
  };
}

/**
 * Build availableHoursByWeek for keys using capacity engine.
 */
function buildAvailableHoursByWeek(
  weekKeys = [],
  { calendar = {}, holidays = [], hoursPerWeekDefault = 40, requireCalendar = false } = {}
) {
  const out = {};
  const calEmpty =
    !calendar ||
    (typeof calendar === 'object' &&
      !calendar.workingDayIndexes &&
      calendar.hoursPerDay == null &&
      requireCalendar);

  for (const weekKey of weekKeys) {
    if (calEmpty) {
      out[weekKey] = null;
      continue;
    }
    const cap = availableCapacityHours({
      weekKey,
      calendar,
      holidays,
      hoursPerWeekDefault,
    });
    if (
      requireCalendar &&
      cap.calculationBasis?.source === 'fallback_hoursPerWeekDefault'
    ) {
      out[weekKey] = null;
    } else {
      out[weekKey] = cap.availableHours;
    }
  }
  return out;
}

/**
 * Allocate-from-budget residual math (pure).
 * @returns {{ ok: true, residualHoursPerWeek, hoursAllocated } | { ok: false, message }}
 */
function applyAllocateFromBudget({
  hoursPerWeek,
  residualHoursPerWeek,
  allocateHours,
} = {}) {
  const base = Number(hoursPerWeek);
  const residual =
    residualHoursPerWeek != null ? Number(residualHoursPerWeek) : base;
  const take = Number(allocateHours);
  if (!Number.isFinite(base) || base < 0) {
    return { ok: false, message: 'hoursPerWeek không hợp lệ' };
  }
  if (!Number.isFinite(residual) || residual < 0) {
    return { ok: false, message: 'residualHoursPerWeek không hợp lệ' };
  }
  if (!Number.isFinite(take) || take <= 0) {
    return { ok: false, message: 'allocateHours phải > 0' };
  }
  if (take > residual + 1e-9) {
    return { ok: false, message: 'allocateHours vượt residual budget' };
  }
  const next = Math.round((residual - take) * 100) / 100;
  return {
    ok: true,
    residualHoursPerWeek: Math.max(0, next),
    hoursAllocated: Math.round(take * 100) / 100,
  };
}

module.exports = {
  addHoursMap,
  budgetHoursByWeek,
  taskPlannedHoursByWeek,
  plannedMeetingHoursByWeek,
  computeForecastDemandByWeek,
  projectForecastWithDelta,
  buildAvailableHoursByWeek,
  applyAllocateFromBudget,
};
