/**
 * Spread planned hours across weeks in a date window.
 * Total hours across weeks === source hours (within rounding).
 */

const { DAY_MS, toDayMs } = require('../../utils/staffing/allocationOverlap');
const { weekKeyFromDate } = require('./capacity');
const { normalizeWorkingCalendar, isCapacityDay } = require('../../utils/staffing/workingCalendar');

function listWeekKeysInRange(fromMs, toMs, { tzOffsetHours = 7 } = {}) {
  const start = toDayMs(fromMs);
  const end = toDayMs(toMs);
  if (start == null || end == null || end < start) return [];
  const keys = [];
  const seen = new Set();
  for (let d = start; d <= end; d += DAY_MS) {
    const key = weekKeyFromDate(new Date(d), { tzOffsetHours });
    if (key && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}

function workingDaysInWeek(weekKey, calendar = {}, holidays = []) {
  const cal = normalizeWorkingCalendar(calendar);
  const start = toDayMs(`${weekKey}T00:00:00.000Z`);
  if (start == null) return 0;
  let days = 0;
  for (let i = 0; i < 7; i += 1) {
    if (isCapacityDay(start + i * DAY_MS, cal, holidays)) days += 1;
  }
  return days;
}

/**
 * @param {object} opts
 * @param {number} opts.totalHours
 * @param {string|Date} opts.startDate
 * @param {string|Date|null} opts.endDate
 * @param {'even_weeks'|'front_loaded'|'back_loaded'} [opts.spreadPolicy]
 * @param {object} [opts.calendar]
 * @param {Array} [opts.holidays]
 * @returns {Record<string, number>} weekKey → hours
 */
function spreadHoursAcrossWeeks({
  totalHours,
  startDate,
  endDate = null,
  spreadPolicy = 'even_weeks',
  calendar = {},
  holidays = [],
  tzOffsetHours = 7,
} = {}) {
  const hours = Math.max(0, Number(totalHours) || 0);
  if (!(hours > 0)) return {};

  const startMs = toDayMs(startDate);
  let endMs = endDate == null || endDate === '' ? startMs : toDayMs(endDate);
  if (startMs == null) return {};
  if (endMs == null || endMs < startMs) endMs = startMs;

  const weekKeys = listWeekKeysInRange(startMs, endMs, { tzOffsetHours });
  if (!weekKeys.length) {
    const key = weekKeyFromDate(new Date(startMs), { tzOffsetHours });
    return key ? { [key]: Math.round(hours * 100) / 100 } : {};
  }

  const weights = weekKeys.map((wk, idx) => {
    const workDays = workingDaysInWeek(wk, calendar, holidays);
    const base = Math.max(1, workDays);
    if (spreadPolicy === 'front_loaded') return base * (weekKeys.length - idx);
    if (spreadPolicy === 'back_loaded') return base * (idx + 1);
    return base;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;

  const out = {};
  let allocated = 0;
  for (let i = 0; i < weekKeys.length; i += 1) {
    const isLast = i === weekKeys.length - 1;
    let slice;
    if (isLast) {
      slice = Math.round((hours - allocated) * 100) / 100;
    } else {
      slice = Math.round(((hours * weights[i]) / weightSum) * 100) / 100;
      allocated += slice;
    }
    if (slice > 0) out[weekKeys[i]] = slice;
  }
  return out;
}

/**
 * Spread recurring hoursPerWeek across each week in phase window (same hours each week).
 */
function spreadHoursPerWeekAcrossPhase({
  hoursPerWeek,
  phaseStartDate,
  phaseEndDate,
  calendar = {},
  holidays = [],
  tzOffsetHours = 7,
} = {}) {
  const h = Math.max(0, Number(hoursPerWeek) || 0);
  if (!(h > 0)) return {};
  const startMs = toDayMs(phaseStartDate) ?? toDayMs(new Date());
  const endMs = toDayMs(phaseEndDate) ?? startMs + 28 * DAY_MS;
  const weekKeys = listWeekKeysInRange(startMs, endMs, { tzOffsetHours });
  if (!weekKeys.length) {
    const key = weekKeyFromDate(new Date(startMs), { tzOffsetHours });
    return key ? { [key]: Math.round(h * 100) / 100 } : {};
  }
  const out = {};
  for (const wk of weekKeys) {
    const days = workingDaysInWeek(wk, calendar, holidays);
    if (days <= 0) continue;
    out[wk] = Math.round(h * 100) / 100;
  }
  return out;
}

module.exports = {
  listWeekKeysInRange,
  workingDaysInWeek,
  spreadHoursAcrossWeeks,
  spreadHoursPerWeekAcrossPhase,
};
