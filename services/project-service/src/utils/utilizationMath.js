/**
 * Pure utilization math (Phase 3b) — no DB.
 */
const {
  availablePctOnDay,
} = require('./allocationOverlap');
const { DEFAULT_HOURS_PER_DAY } = require('./timeTracking');

const DAY_MS = 24 * 60 * 60 * 1000;

function plannedAvailableHoursInRange({
  flatSegments,
  fromMs,
  toMs,
  hoursPerDay = DEFAULT_HOURS_PER_DAY,
  calendar,
  holidays,
} = {}) {
  if (fromMs == null || toMs == null || toMs < fromMs) return 0;
  const hpd = Number(hoursPerDay) > 0 ? Number(hoursPerDay) : DEFAULT_HOURS_PER_DAY;
  const useCalendar = calendar != null || (Array.isArray(holidays) && holidays.length > 0);
  let sum = 0;
  for (let d = fromMs; d <= toMs; d += DAY_MS) {
    if (useCalendar) {
      const { isCapacityDay } = require('./workingCalendar');
      if (!isCapacityDay(d, calendar || {}, holidays || [])) continue;
    }
    const availPct = availablePctOnDay(flatSegments || [], d);
    sum += (availPct / 100) * hpd;
  }
  return Math.round(sum * 100) / 100;
}

function utilizationPct(actualHours, plannedAvailableHours) {
  const planned = Number(plannedAvailableHours);
  const actual = Number(actualHours) || 0;
  if (!Number.isFinite(planned) || planned <= 0) {
    return null;
  }
  return Math.round((actual / planned) * 10000) / 100;
}

module.exports = {
  plannedAvailableHoursInRange,
  utilizationPct,
  DAY_MS,
};
