/**
 * Soft boost for member-candidate scoring from Historical Performance rollup.
 * Capacity remains primary; boost is clamped small (±15–20).
 */

const BOOST_MIN = -15;
const BOOST_MAX = 20;
const VELOCITY_HOURS_MIN = 5;
const VELOCITY_HOURS_MAX = 40;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function toSlimPerformance(rollup) {
  if (!rollup || typeof rollup !== 'object') return null;
  return {
    confidence: rollup.confidence || 'low',
    estimationAccuracyPct:
      rollup.estimation?.accuracyPct != null && Number.isFinite(Number(rollup.estimation.accuracyPct))
        ? Number(rollup.estimation.accuracyPct)
        : null,
    reworkRate:
      rollup.quality?.reworkRate != null && Number.isFinite(Number(rollup.quality.reworkRate))
        ? Number(rollup.quality.reworkRate)
        : null,
    actualHoursPerWeek:
      rollup.velocity?.actualHoursPerWeek != null &&
      Number.isFinite(Number(rollup.velocity.actualHoursPerWeek))
        ? Number(rollup.velocity.actualHoursPerWeek)
        : null,
  };
}

/**
 * @param {object|null|undefined} rollup — buildUserPerformanceRollup output
 * @returns {{ boost: number, reasons: string[], slim: object|null }}
 */
function scoreHistoricalPerformance(rollup) {
  const slim = toSlimPerformance(rollup);
  if (!slim) {
    return { boost: 0, reasons: [], slim: null };
  }

  const confidence = String(rollup.confidence || 'low').toLowerCase();
  if (confidence === 'low') {
    return { boost: 0, reasons: [], slim };
  }

  let boost = 0;
  const reasons = [];

  const accuracy = slim.estimationAccuracyPct;
  if (accuracy != null && accuracy > 0) {
    const accuracyBoost = Math.min(10, Math.floor(accuracy / 10));
    if (accuracyBoost > 0) {
      boost += accuracyBoost;
      reasons.push('perf_accuracy');
    }
  }

  const rework = slim.reworkRate;
  if (rework != null && rework > 0) {
    const penalty = Math.min(10, Math.floor(rework * 20));
    if (penalty > 0) {
      boost -= penalty;
      reasons.push('perf_rework_penalty');
    }
  }

  const reopen =
    rollup.quality?.reopenRate != null && Number.isFinite(Number(rollup.quality.reopenRate))
      ? Number(rollup.quality.reopenRate)
      : null;
  if (reopen != null && reopen > 0) {
    const penalty = Math.min(8, Math.floor(reopen * 15));
    if (penalty > 0) {
      boost -= penalty;
      reasons.push('perf_reopen_penalty');
    }
  }

  const hours = slim.actualHoursPerWeek;
  if (hours != null && hours >= VELOCITY_HOURS_MIN && hours <= VELOCITY_HOURS_MAX) {
    boost += 3;
    reasons.push('perf_velocity_healthy');
  }

  if (confidence === 'medium' && boost > 0) {
    boost = Math.floor(boost * 0.7);
  }

  boost = clamp(boost, BOOST_MIN, BOOST_MAX);
  return { boost, reasons, slim };
}

module.exports = {
  scoreHistoricalPerformance,
  toSlimPerformance,
  BOOST_MIN,
  BOOST_MAX,
};
