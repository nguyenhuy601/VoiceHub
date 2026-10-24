/**
 * One actual-versus-forecast pair never writes a new coefficient.
 * Unconfirmed model output is not evidence (RULE-SL-13).
 */

function assessForecastDelta({
  estimatedHours,
  actualHours,
  scopeChanged = false,
  waitHours = 0,
  skillGap = false,
  dataQuality = 'unknown',
} = {}) {
  const estimated = Number(estimatedHours);
  const actual = Number(actualHours);
  const ratio = estimated > 0 && Number.isFinite(actual) ? actual / estimated : null;
  const confounded =
    scopeChanged === true || waitHours > 0 || skillGap === true || dataQuality !== 'trusted';
  return {
    ratio,
    applyCoefficient: false,
    reason: confounded ? 'CONFOUNDED' : 'INSUFFICIENT_SAMPLE',
  };
}

function acceptOutcomeObservation({ source, reviewStatus } = {}) {
  if (source === 'AI_UNCONFIRMED' || reviewStatus !== 'CONFIRMED') {
    return { accepted: false, code: 'UNCONFIRMED_NOT_EVIDENCE' };
  }
  return { accepted: true };
}

module.exports = {
  assessForecastDelta,
  acceptOutcomeObservation,
};
