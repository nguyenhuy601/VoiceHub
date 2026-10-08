/**
 * Aggregate planned-allocation hours per user/day in a planning window.
 * Real allocation segments + org calendar only — never invents hours.
 */

const {
  DAY_MS,
  toDayMs,
  allocatedPctOnDay,
} = require('./allocationOverlap');
const {
  normalizeWorkingCalendar,
  isCapacityDay,
} = require('./workingCalendar');

function dateKeyUtc(dayMs) {
  return new Date(dayMs).toISOString().slice(0, 10);
}

/**
 * @param {object} opts
 * @param {Array<{ userId: string, flatSegments?: Array }>} opts.users
 * @param {number} opts.fromMs
 * @param {number} opts.toMs
 * @param {object} [opts.calendar]
 * @param {Array} [opts.holidays]
 * @returns {Record<string, number>} keys `${userId}|YYYY-MM-DD` → booked hours
 */
function buildBookedHoursByUserDay({
  users = [],
  fromMs,
  toMs,
  calendar = {},
  holidays = [],
} = {}) {
  const start = toDayMs(fromMs);
  const end = toDayMs(toMs);
  if (start == null || end == null || end < start) return {};

  const cal = normalizeWorkingCalendar(calendar);
  const hpd = cal.hoursPerDay;
  const out = {};

  for (const user of users) {
    const uid = String(user?.userId || '').trim();
    if (!uid) continue;
    const flat = Array.isArray(user.flatSegments) ? user.flatSegments : [];
    if (!flat.length) continue;

    for (let d = start; d <= end; d += DAY_MS) {
      if (!isCapacityDay(d, cal, holidays)) continue;
      const pct = allocatedPctOnDay(flat, d);
      if (!(pct > 0)) continue;
      const hours = Math.round((pct / 100) * hpd * 100) / 100;
      if (!(hours > 0)) continue;
      const key = `${uid}|${dateKeyUtc(d)}`;
      out[key] = Math.round(((Number(out[key]) || 0) + hours) * 100) / 100;
    }
  }

  return out;
}

/**
 * O(1) quality summary for SNAP ingestionValidation — never invents hours.
 * @param {{ bookedHoursByUserDay?: object|null, hadPlanningWindow?: boolean }} opts
 */
function summarizeBookedHoursQuality({
  bookedHoursByUserDay = null,
  hadPlanningWindow = false,
} = {}) {
  const map =
    bookedHoursByUserDay &&
    typeof bookedHoursByUserDay === 'object' &&
    !Array.isArray(bookedHoursByUserDay)
      ? bookedHoursByUserDay
      : {};
  const bookedHoursDaysCount = Object.keys(map).length;
  let bookedHoursStatus;
  if (!hadPlanningWindow) {
    bookedHoursStatus = 'no_window';
  } else if (bookedHoursDaysCount === 0) {
    bookedHoursStatus = 'no_allocation';
  } else {
    bookedHoursStatus = 'ok';
  }
  return { bookedHoursDaysCount, bookedHoursStatus };
}

module.exports = {
  buildBookedHoursByUserDay,
  dateKeyUtc,
  summarizeBookedHoursQuality,
};
