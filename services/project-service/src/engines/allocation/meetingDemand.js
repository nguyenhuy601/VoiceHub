/**
 * Build per-subject meeting demand maps from plans + events.
 */

const { weekKeyFromDate } = require('./capacity');
const {
  computeMeetingDemandForWeek,
  participantPlannedHours,
} = require('./dedupePlanEvent');

/**
 * @param {object} opts
 * @param {Array<{ weekKey: string, roleKey?: string, userId?: string, hours: number }>} opts.planLines
 * @param {Array<object>} opts.events — MeetingEvent-like
 * @param {number} [opts.tzOffsetHours]
 */
function aggregateMeetingDemandBySubjectWeek({
  planLines = [],
  events = [],
  tzOffsetHours = 7,
  suggestChangePct = 20,
} = {}) {
  /** @type {Map<string, number>} key = `${subject}|${weekKey}` subject = user:id or role:key */
  const planMap = new Map();
  for (const line of planLines) {
    const weekKey = String(line.weekKey || '');
    if (!weekKey) continue;
    const subject = line.userId
      ? `user:${line.userId}`
      : `role:${line.roleKey || 'unknown'}`;
    const key = `${subject}|${weekKey}`;
    planMap.set(key, (planMap.get(key) || 0) + Math.max(0, Number(line.hours) || 0));
  }

  /** eventsBySubjectWeek → list of { status, plannedHours } */
  const eventMap = new Map();
  for (const ev of events) {
    const st = String(ev.status || 'scheduled').toLowerCase();
    const weekKey =
      ev.weekKey ||
      weekKeyFromDate(ev.startAt, { tzOffsetHours }) ||
      '';
    if (!weekKey) continue;
    const internals = Array.isArray(ev.participants) ? ev.participants : [];
    for (const p of internals) {
      if (p?.isExternal) continue;
      const uid = String(p.userId || '').trim();
      if (!uid) continue;
      const hours = participantPlannedHours({
        startAt: ev.startAt,
        endAt: ev.endAt,
        plannedDurationMinutes: p.plannedDurationMinutes,
      });
      const key = `user:${uid}|${weekKey}`;
      if (!eventMap.has(key)) eventMap.set(key, []);
      eventMap.get(key).push({ status: st, plannedHours: hours, eventId: String(ev.id || ev._id || '') });
    }
  }

  const keys = new Set([...planMap.keys(), ...eventMap.keys()]);
  const rows = [];
  for (const key of keys) {
    const [subject, weekKey] = key.split('|');
    const demand = computeMeetingDemandForWeek({
      planBudgetHours: planMap.get(key) || 0,
      events: eventMap.get(key) || [],
    });
    const warn = require('./dedupePlanEvent').planExceedWarning({
      planBudget: demand.planBudget,
      forecastDemandMeet: demand.forecastDemandMeet,
      suggestChangePct,
    });
    rows.push({
      subject,
      weekKey,
      ...demand,
      exceed: warn,
    });
  }
  return rows;
}

module.exports = {
  aggregateMeetingDemandBySubjectWeek,
};
