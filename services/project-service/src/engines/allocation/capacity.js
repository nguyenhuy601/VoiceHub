/**
 * Available capacity for a week — pure.
 * RULE-CAP-01: meetings are NEVER subtracted from A (they belong in demand numerator).
 */

const { normalizeWorkingCalendar, isCapacityDay } = require('../../utils/staffing/workingCalendar');
const { DAY_MS, toDayMs } = require('../../utils/staffing/allocationOverlap');

function resolveDayMs(raw) {
  return toDayMs(raw);
}

function resolveDayMsStep() {
  return DAY_MS;
}

/**
 * Monday 00:00 UTC-ish week key in org TZ approximated via offset hours.
 * MVP: use Asia/Ho_Chi_Minh as +7 fixed unless caller passes weekStartMs.
 */
function weekKeyFromDate(date, { tzOffsetHours = 7 } = {}) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + tzOffsetHours * 3600 * 1000);
  const day = shifted.getUTCDay(); // 0 Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(
    Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate() + diffToMon)
  );
  return mon.toISOString().slice(0, 10);
}

/**
 * Gross working hours in [weekStart, weekStart+7d) after calendar + holidays.
 */
function grossHoursForWeek({
  weekKey,
  calendar = {},
  holidays = [],
  hoursPerWeekDefault = 40,
} = {}) {
  const cal = normalizeWorkingCalendar(calendar);
  const start = resolveDayMs(`${weekKey}T00:00:00.000Z`);
  if (start == null) {
    return {
      grossHours: hoursPerWeekDefault,
      calculationBasis: { source: 'fallback_hoursPerWeekDefault', ptoExcluded: true },
    };
  }
  const step = resolveDayMsStep();
  let days = 0;
  for (let i = 0; i < 7; i += 1) {
    const ms = start + i * step;
    if (isCapacityDay(ms, cal, holidays)) days += 1;
  }
  const grossHours = days * Number(cal.hoursPerDay || 8);
  return {
    grossHours: grossHours > 0 ? grossHours : hoursPerWeekDefault,
    workingDays: days,
    hoursPerDay: cal.hoursPerDay,
    calculationBasis: {
      source: 'working_calendar_holidays',
      ptoExcluded: true,
      weekKey,
    },
  };
}

/**
 * Available capacity A_W = G_W - U_W (MVP U = 0 beyond holidays already in G).
 */
function availableCapacityHours(opts = {}) {
  const { unavailableHours = 0 } = opts;
  const gross = grossHoursForWeek(opts);
  const u = Math.max(0, Number(unavailableHours) || 0);
  const availableHours = Math.max(0, gross.grossHours - u);
  return {
    ...gross,
    unavailableHours: u,
    availableHours,
    calculationBasis: {
      ...gross.calculationBasis,
      note: 'MVP does not subtract employee PTO; ptoExcluded=true',
    },
  };
}

function workloadPct({ demandHours, availableHours }) {
  const a = Number(availableHours);
  const d = Math.max(0, Number(demandHours) || 0);
  if (!Number.isFinite(a) || a <= 0) {
    return { workloadPct: null, demandHours: d, availableHours: a || 0 };
  }
  return {
    workloadPct: Math.round((d / a) * 10000) / 100,
    demandHours: d,
    availableHours: a,
  };
}

module.exports = {
  weekKeyFromDate,
  grossHoursForWeek,
  availableCapacityHours,
  workloadPct,
};
