/**
 * Cross-project workload aggregate — pure.
 * Forecast demand (Wave 1) prefers forecastDemand.js (budget+task+meeting).
 * Commitment % stays on ProjectMember.allocations (separate SoT).
 */

const { availableCapacityHours, workloadPct, weekKeyFromDate } = require('./capacity');
const { aggregateMeetingDemandBySubjectWeek } = require('./meetingDemand');

/**
 * @param {object} opts
 * @param {string} opts.userId
 * @param {string} opts.weekKey
 * @param {number} opts.taskDemandHours — Σ task planned hours for user that week (all projects)
 * @param {number} opts.meetingDemandHours — forecastDemandMeet for user that week
 * @param {object} [opts.calendar]
 * @param {Array} [opts.holidays]
 * @param {number} [opts.hoursPerWeekDefault]
 */
function computeUserWeekWorkload({
  userId,
  weekKey,
  taskDemandHours = 0,
  meetingDemandHours = 0,
  otherDemandHours = 0,
  calendar = {},
  holidays = [],
  hoursPerWeekDefault = 40,
  overloadWarnPct = 100,
} = {}) {
  const cap = availableCapacityHours({
    weekKey,
    calendar,
    holidays,
    hoursPerWeekDefault,
  });
  const demandHours =
    Math.max(0, Number(taskDemandHours) || 0) +
    Math.max(0, Number(meetingDemandHours) || 0) +
    Math.max(0, Number(otherDemandHours) || 0);
  const wl = workloadPct({ demandHours, availableHours: cap.availableHours });
  const overloaded =
    wl.workloadPct != null && wl.workloadPct > Number(overloadWarnPct);
  return {
    userId: String(userId || ''),
    weekKey,
    taskDemandHours: Math.max(0, Number(taskDemandHours) || 0),
    meetingDemandHours: Math.max(0, Number(meetingDemandHours) || 0),
    otherDemandHours: Math.max(0, Number(otherDemandHours) || 0),
    demandHours: Math.round(demandHours * 100) / 100,
    availableHours: cap.availableHours,
    grossHours: cap.grossHours,
    workloadPct: wl.workloadPct,
    overloaded,
    calculationBasis: cap.calculationBasis,
    // Explicit: commitment is orthogonal
    commitmentNote: 'Use ProjectMember.allocations for commitmentPct — not derived here',
  };
}

/**
 * Build meeting demand map user|week → forecastDemandMeet then merge with task hours.
 */
function aggregateWorkloadRows({
  planLines = [],
  events = [],
  taskHoursByUserWeek = {}, // { 'userId|weekKey': hours }
  calendar = {},
  holidays = [],
  hoursPerWeekDefault = 40,
  overloadWarnPct = 100,
  tzOffsetHours = 7,
  suggestChangePct = 20,
} = {}) {
  const meetingRows = aggregateMeetingDemandBySubjectWeek({
    planLines,
    events,
    tzOffsetHours,
    suggestChangePct,
  });
  const meetByUserWeek = new Map();
  for (const row of meetingRows) {
    if (!String(row.subject || '').startsWith('user:')) continue;
    const uid = row.subject.slice(5);
    meetByUserWeek.set(`${uid}|${row.weekKey}`, row.forecastDemandMeet);
  }

  const keys = new Set([
    ...Object.keys(taskHoursByUserWeek || {}),
    ...meetByUserWeek.keys(),
  ]);
  const out = [];
  for (const key of keys) {
    const [userId, weekKey] = key.split('|');
    out.push(
      computeUserWeekWorkload({
        userId,
        weekKey,
        taskDemandHours: Number(taskHoursByUserWeek[key]) || 0,
        meetingDemandHours: meetByUserWeek.get(key) || 0,
        calendar,
        holidays,
        hoursPerWeekDefault,
        overloadWarnPct,
      })
    );
  }
  return { rows: out, meetingDetail: meetingRows };
}

module.exports = {
  computeUserWeekWorkload,
  aggregateWorkloadRows,
  weekKeyFromDate,
};
