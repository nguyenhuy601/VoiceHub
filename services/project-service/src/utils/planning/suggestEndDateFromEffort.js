/**
 * Weekday end date from start + effort.
 * Must match client/src/features/projects/phase1/planning/staffingPipelineModel.js
 * suggestEndDateFromEffort: 8h = 1 weekday, skip Saturday and Sunday, no organization holidays.
 */

const HOURS_PER_MANDAY = 8;

function suggestEndDateFromEffort(startIso, effortHours) {
  const start = String(startIso || '').trim().slice(0, 10);
  const h = Number(effortHours);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(h) || h <= 0) return null;
  const daysNeeded = Math.max(1, Math.ceil(h / HOURS_PER_MANDAY));
  const d = new Date(`${start}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  let added = 0;
  while (added < daysNeeded) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d.toISOString().slice(0, 10);
}

module.exports = {
  HOURS_PER_MANDAY,
  suggestEndDateFromEffort,
};
