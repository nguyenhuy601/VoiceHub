/**
 * Gate2 SoT — phaseRuns.phase_how (RULE-PO-04). No container.jobs.
 */

/**
 * One-shot migrate legacy jobs.projectPlan → phase_how, then drop jobs.
 * @param {object} container
 * @returns {object}
 */
function migrateJobsProjectionToPhaseRuns(container) {
  if (!container || typeof container !== 'object') {
    return { phaseRuns: {}, analyses: {}, planning: {}, resource: {} };
  }
  const next = { ...container };
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  const legacyPlan = next.jobs?.projectPlan;
  const legacyStatus = String(legacyPlan?.status || '');
  const how = { ...(next.phaseRuns.phase_how || {}) };

  if (!how.status || how.status === 'empty') {
    if (legacyStatus === 'confirmed') {
      how.status = 'confirmed';
      how.confirmedAt = legacyPlan.confirmedAt || new Date().toISOString();
      how.hitl = 'gate2';
    } else if (legacyStatus === 'ready' || legacyStatus === 'pending') {
      how.status = legacyStatus === 'pending' ? 'pending' : 'ready';
      how.hitl = 'gate2';
    }
  }
  if (Object.keys(how).length) {
    next.phaseRuns.phase_how = how;
  }
  if (next.jobs != null) delete next.jobs;
  if (next.currentJob != null) delete next.currentJob;
  return next;
}

function getPhaseHowStatus(containerOrPack) {
  const container =
    containerOrPack?.aiAnalysis && typeof containerOrPack.aiAnalysis === 'object'
      ? containerOrPack.aiAnalysis
      : containerOrPack;
  return String(container?.phaseRuns?.phase_how?.status || '');
}

function isPhaseHowConfirmed(containerOrPack) {
  return getPhaseHowStatus(containerOrPack) === 'confirmed';
}

/**
 * Mark phase_how confirmed (Gate2 human confirm).
 * @param {object} container
 */
function markPhaseHowConfirmed(container) {
  const next = migrateJobsProjectionToPhaseRuns(container || {});
  const now = new Date().toISOString();
  next.phaseRuns = { ...(next.phaseRuns || {}) };
  next.phaseRuns.phase_how = {
    ...(next.phaseRuns.phase_how || {}),
    status: 'confirmed',
    hitl: 'gate2',
    confirmedAt: now,
    error: null,
  };
  return next;
}

/**
 * @throws {{ statusCode: number, errorCode: string }}
 */
function assertPhaseHowReadyForConfirm(container) {
  const status = getPhaseHowStatus(container);
  if (status !== 'ready' && status !== 'confirmed') {
    const err = new Error(
      `Gate 2: phase_how must be ready before confirm (current: ${status || 'empty'})`
    );
    err.statusCode = 409;
    err.errorCode = 'GATE2_PHASE_HOW_NOT_READY';
    err.details = { phase_how: status || 'empty' };
    throw err;
  }
}

module.exports = {
  migrateJobsProjectionToPhaseRuns,
  getPhaseHowStatus,
  isPhaseHowConfirmed,
  markPhaseHowConfirmed,
  assertPhaseHowReadyForConfirm,
};
