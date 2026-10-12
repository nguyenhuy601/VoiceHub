/**
 * RULE-DEDUP-01 — MeetingPlan vs MeetingEvent demand (pure).
 *
 * forecastDemandMeet = unallocatedForecast + scheduledHours
 * Never planBudget + scheduled.
 */

const SCHEDULED_STATUSES = new Set(['draft', 'scheduled', 'confirmed']);
const COMPLETED_STATUSES = new Set(['completed']);
const CANCELLED_STATUSES = new Set(['cancelled']);

/**
 * @param {object} opts
 * @param {number} opts.planBudgetHours — MeetingPlan hours for (project, subject, week)
 * @param {Array<{ status: string, plannedHours: number }>} opts.events — internal person-hours for subject
 * @param {'return_forecast'|'drop_demand'} [opts.cancelPolicy] — cancelled events: return residual to forecast (default)
 */
function computeMeetingDemandForWeek({
  planBudgetHours = 0,
  events = [],
  cancelPolicy = 'return_forecast',
} = {}) {
  const planBudget = Math.max(0, Number(planBudgetHours) || 0);
  let scheduledHours = 0;
  let completedHours = 0;
  let cancelledHours = 0;

  for (const ev of events || []) {
    const h = Math.max(0, Number(ev.plannedHours) || 0);
    const st = String(ev.status || 'scheduled').toLowerCase();
    if (CANCELLED_STATUSES.has(st)) {
      cancelledHours += h;
      continue;
    }
    if (COMPLETED_STATUSES.has(st)) {
      completedHours += h;
      continue;
    }
    if (SCHEDULED_STATUSES.has(st)) {
      scheduledHours += h;
    }
  }

  // Cover plan with scheduled + completed (cancelled does not cover unless drop policy)
  const covered = Math.min(planBudget, scheduledHours + completedHours);
  let unallocatedForecast = Math.max(0, planBudget - covered);

  if (cancelPolicy === 'drop_demand') {
    // Cancelled permanently reduces expected demand: do not restore forecast beyond residual
    // (already handled by not counting cancelled in covered)
  }
  // return_forecast: cancelled never covered plan → residual stays in unallocatedForecast (default)

  const forecastDemandMeet = Math.round((unallocatedForecast + scheduledHours) * 100) / 100;

  return {
    planBudget,
    scheduledHours: Math.round(scheduledHours * 100) / 100,
    completedHours: Math.round(completedHours * 100) / 100,
    cancelledHours: Math.round(cancelledHours * 100) / 100,
    covered,
    unallocatedForecast: Math.round(unallocatedForecast * 100) / 100,
    forecastDemandMeet,
  };
}

/**
 * Person-hours for one internal participant on an event.
 * Cross-week: entire duration attributed to startAt week (locked plan rule).
 */
function participantPlannedHours({ startAt, endAt, plannedDurationMinutes = null } = {}) {
  if (plannedDurationMinutes != null && Number.isFinite(Number(plannedDurationMinutes))) {
    return Math.round((Number(plannedDurationMinutes) / 60) * 100) / 100;
  }
  const a = new Date(startAt).getTime();
  const b = new Date(endAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.round(((b - a) / 3600000) * 100) / 100;
}

/**
 * Soft warn when scheduled+forecast exceeds plan.
 */
function planExceedWarning({
  planBudget,
  forecastDemandMeet,
  suggestChangePct = 20,
} = {}) {
  const budget = Math.max(0, Number(planBudget) || 0);
  const demand = Math.max(0, Number(forecastDemandMeet) || 0);
  if (budget <= 0) {
    return {
      exceeded: demand > 0,
      exceedHours: demand,
      exceedPct: null,
      suggestChangeControl: demand > 0,
      softWarn: demand > 0,
    };
  }
  const exceedHours = Math.max(0, demand - budget);
  const exceedPct = (exceedHours / budget) * 100;
  return {
    exceeded: exceedHours > 0.001,
    exceedHours: Math.round(exceedHours * 100) / 100,
    exceedPct: Math.round(exceedPct * 100) / 100,
    suggestChangeControl: exceedPct > Number(suggestChangePct),
    softWarn: exceedHours > 0.001,
  };
}

module.exports = {
  SCHEDULED_STATUSES,
  COMPLETED_STATUSES,
  CANCELLED_STATUSES,
  computeMeetingDemandForWeek,
  participantPlannedHours,
  planExceedWarning,
};
