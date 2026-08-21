/**
 * Pure range capacity math — planned allocation ∩ org working calendar + holidays.
 */

const {
  DAY_MS,
  allocatedPctOnDay,
  classifyAvailability,
} = require('./allocationOverlap');
const {
  normalizeWorkingCalendar,
  isCapacityDay,
  isHolidayDay,
  isWorkingDay,
  countWorkingDaysInRange,
  workingCapacityHoursInRange,
} = require('./workingCalendar');

/**
 * Capacity for one user over [fromMs, toMs] inclusive, capacity days only.
 */
function computeUserRangeCapacity({
  flatSegments = [],
  fromMs,
  toMs,
  calendar = {},
  holidays = [],
} = {}) {
  if (fromMs == null || toMs == null || toMs < fromMs) {
    return {
      workingDays: 0,
      grossHours: 0,
      allocatedHours: 0,
      availableHours: 0,
      peakAllocatedPct: 0,
      avgAvailablePct: null,
      availability: 'available',
    };
  }

  const cal = normalizeWorkingCalendar(calendar);
  const hpd = cal.hoursPerDay;
  const workingDays = countWorkingDaysInRange(fromMs, toMs, cal, holidays);
  const grossHours = workingCapacityHoursInRange({
    fromMs,
    toMs,
    calendar: cal,
    holidays,
  });

  let allocatedHours = 0;
  let peakAllocatedPct = 0;

  for (let d = fromMs; d <= toMs; d += DAY_MS) {
    if (!isCapacityDay(d, cal, holidays)) continue;
    const pct = allocatedPctOnDay(flatSegments, d);
    if (pct > peakAllocatedPct) peakAllocatedPct = pct;
    allocatedHours += (pct / 100) * hpd;
  }

  allocatedHours = Math.round(allocatedHours * 100) / 100;
  peakAllocatedPct = Math.round(peakAllocatedPct * 100) / 100;
  const availableHours = Math.max(0, Math.round((grossHours - allocatedHours) * 100) / 100);
  const avgAvailablePct =
    grossHours > 0
      ? Math.round((availableHours / grossHours) * 10000) / 100
      : null;

  return {
    workingDays,
    grossHours,
    allocatedHours,
    availableHours,
    peakAllocatedPct,
    avgAvailablePct,
    availability: classifyAvailability(peakAllocatedPct),
  };
}

/**
 * Count holidays that fall on otherwise-working days inside the window.
 */
function countHolidaysInRange(fromMs, toMs, calendar = {}, holidays = []) {
  if (fromMs == null || toMs == null || toMs < fromMs) return 0;
  const cal = normalizeWorkingCalendar(calendar);
  let count = 0;
  for (let d = fromMs; d <= toMs; d += DAY_MS) {
    if (!isHolidayDay(d, holidays)) continue;
    if (isWorkingDay(d, cal)) count += 1;
  }
  return count;
}

/**
 * Envelope metadata for pool response window.
 */
function buildWindowMeta({ fromMs, toMs, from, to, calendar = {}, holidays = [] } = {}) {
  const cal = normalizeWorkingCalendar(calendar);
  return {
    from: from || new Date(fromMs).toISOString().slice(0, 10),
    to: to || new Date(toMs).toISOString().slice(0, 10),
    workingDays: countWorkingDaysInRange(fromMs, toMs, cal, holidays),
    hoursPerDay: cal.hoursPerDay,
    holidayCountInRange: countHolidaysInRange(fromMs, toMs, cal, holidays),
  };
}

module.exports = {
  computeUserRangeCapacity,
  countHolidaysInRange,
  buildWindowMeta,
};
