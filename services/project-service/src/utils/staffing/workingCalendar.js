/**
 * Org working calendar — pure helpers (Mon=1 … Sun=0 UTC weekday).
 */
const { DEFAULT_HOURS_PER_DAY } = require('./timeTracking');
const { DAY_MS, toDayMs } = require('./allocationOverlap');

const DEFAULT_WORKING_DAY_INDEXES = Object.freeze([1, 2, 3, 4, 5]);
const DEFAULT_BILLING_DAYS_PER_MONTH = 20;

function normalizeWorkingCalendar(raw = {}) {
  const hoursPerDay = Number(raw.hoursPerDay);
  const billingDaysPerMonth = Number(raw.billingDaysPerMonth);
  const indexes = Array.isArray(raw.workingDayIndexes)
    ? raw.workingDayIndexes.map((n) => Number(n)).filter((n) => n >= 0 && n <= 6)
    : [...DEFAULT_WORKING_DAY_INDEXES];
  return {
    hoursPerDay:
      Number.isFinite(hoursPerDay) && hoursPerDay > 0 && hoursPerDay <= 24
        ? hoursPerDay
        : DEFAULT_HOURS_PER_DAY,
    workingDayIndexes: indexes.length ? [...new Set(indexes)].sort() : [...DEFAULT_WORKING_DAY_INDEXES],
    billingDaysPerMonth:
      Number.isFinite(billingDaysPerMonth) && billingDaysPerMonth >= 1 && billingDaysPerMonth <= 31
        ? Math.floor(billingDaysPerMonth)
        : DEFAULT_BILLING_DAYS_PER_MONTH,
  };
}

function utcWeekdayIndex(dayMs) {
  const d = new Date(dayMs);
  return d.getUTCDay();
}

function normalizeHolidayDates(holidays = []) {
  const set = new Set();
  for (const row of holidays || []) {
    const ms = toDayMs(row?.date ?? row);
    if (ms != null) set.add(ms);
  }
  return set;
}

function isWorkingDay(dayMs, calendar = {}) {
  const cal = normalizeWorkingCalendar(calendar);
  const idx = utcWeekdayIndex(dayMs);
  return cal.workingDayIndexes.includes(idx);
}

function isHolidayDay(dayMs, holidays = []) {
  const ms = toDayMs(dayMs);
  if (ms == null) return false;
  return normalizeHolidayDates(holidays).has(ms);
}

function isCapacityDay(dayMs, calendar = {}, holidays = []) {
  return isWorkingDay(dayMs, calendar) && !isHolidayDay(dayMs, holidays);
}

function countWorkingDaysInRange(fromMs, toMs, calendar = {}, holidays = []) {
  if (fromMs == null || toMs == null || toMs < fromMs) return 0;
  let count = 0;
  for (let d = fromMs; d <= toMs; d += DAY_MS) {
    if (isCapacityDay(d, calendar, holidays)) count += 1;
  }
  return count;
}

/**
 * Full working capacity hours in range (100% available, no allocation).
 */
function workingCapacityHoursInRange({
  fromMs,
  toMs,
  calendar = {},
  holidays = [],
} = {}) {
  const cal = normalizeWorkingCalendar(calendar);
  const days = countWorkingDaysInRange(fromMs, toMs, cal, holidays);
  return Math.round(days * cal.hoursPerDay * 100) / 100;
}

/**
 * Standard billing month capacity (e.g. 20 × 8 = 160h).
 */
function billingMonthCapacityHours(calendar = {}) {
  const cal = normalizeWorkingCalendar(calendar);
  return Math.round(cal.billingDaysPerMonth * cal.hoursPerDay * 100) / 100;
}

module.exports = {
  DEFAULT_WORKING_DAY_INDEXES,
  DEFAULT_BILLING_DAYS_PER_MONTH,
  normalizeWorkingCalendar,
  normalizeHolidayDates,
  utcWeekdayIndex,
  isWorkingDay,
  isHolidayDay,
  isCapacityDay,
  countWorkingDaysInRange,
  workingCapacityHoursInRange,
  billingMonthCapacityHours,
};
