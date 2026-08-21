/**
 * Pure Historical Performance metrics — dùng chung ETL, report-service, project-service C2.
 * Không I/O; không phụ thuộc mongoose.
 */

const MS_PER_HOUR = 3600000;
const MS_PER_WEEK = 7 * 24 * MS_PER_HOUR;
const MIN_SAMPLE_FOR_MEDIUM = 5;
const MIN_SAMPLE_FOR_HIGH = 15;

function round2(n) {
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function average(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n));
  if (!list.length) return null;
  return round2(list.reduce((a, b) => a + b, 0) / list.length);
}

function median(nums) {
  const list = (nums || []).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!list.length) return null;
  const mid = Math.floor(list.length / 2);
  const v = list.length % 2 ? list[mid] : (list[mid - 1] + list[mid]) / 2;
  return round2(v);
}

/**
 * Estimation accuracy: min(est, act) / max(est, act) → percent 0–100.
 * @returns {number|null}
 */
function estimationAccuracyPct(estimateHours, actualHours) {
  const est = Number(estimateHours);
  const act = Number(actualHours);
  if (!Number.isFinite(est) || !Number.isFinite(act) || est <= 0 || act < 0) return null;
  if (act === 0 && est === 0) return null;
  const hi = Math.max(est, act);
  const lo = Math.min(est, act);
  if (hi <= 0) return null;
  return Math.round((100 * lo) / hi);
}

function estimationBiasHours(estimateHours, actualHours) {
  const est = Number(estimateHours);
  const act = Number(actualHours);
  if (!Number.isFinite(est) || !Number.isFinite(act) || est <= 0) return null;
  return round2(act - est);
}

/**
 * @param {number} tasksCompleted
 * @returns {'low'|'medium'|'high'}
 */
function confidenceFromSampleSize(tasksCompleted) {
  const n = Number(tasksCompleted) || 0;
  if (n >= MIN_SAMPLE_FOR_HIGH) return 'high';
  if (n >= MIN_SAMPLE_FOR_MEDIUM) return 'medium';
  return 'low';
}

/**
 * Suggest calibrated estimate: baseline × (avgActual / avgEstimate) when confidence ≥ medium.
 * @returns {{ suggestedHours: number|null, multiplier: number|null, applied: boolean, reason: string }}
 */
function calibrateEstimateHours({
  baselineHours,
  avgEstimateHours,
  avgActualHours,
  confidence,
  minConfidence = 'medium',
} = {}) {
  const base = Number(baselineHours);
  const order = { low: 0, medium: 1, high: 2 };
  const conf = String(confidence || 'low');
  const min = String(minConfidence || 'medium');
  if (!Number.isFinite(base) || base <= 0) {
    return { suggestedHours: null, multiplier: null, applied: false, reason: 'invalid_baseline' };
  }
  if ((order[conf] ?? 0) < (order[min] ?? 1)) {
    return { suggestedHours: round2(base), multiplier: 1, applied: false, reason: 'insufficient_confidence' };
  }
  const avgEst = Number(avgEstimateHours);
  const avgAct = Number(avgActualHours);
  if (!Number.isFinite(avgEst) || !Number.isFinite(avgAct) || avgEst <= 0 || avgAct < 0) {
    return { suggestedHours: round2(base), multiplier: 1, applied: false, reason: 'missing_bias' };
  }
  const multiplier = avgAct / avgEst;
  return {
    suggestedHours: round2(base * multiplier),
    multiplier: round2(multiplier),
    applied: true,
    reason: 'ok',
  };
}

function hoursBetween(later, earlier) {
  const a = later instanceof Date ? later : later ? new Date(later) : null;
  const b = earlier instanceof Date ? earlier : earlier ? new Date(earlier) : null;
  if (!a || !b || Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const n = (a.getTime() - b.getTime()) / MS_PER_HOUR;
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

/**
 * Build user performance rollup from completed task rows + worklog hours.
 *
 * @param {object} input
 * @param {string} input.organizationId
 * @param {string} input.userId
 * @param {number} [input.windowDays=90]
 * @param {Date|string} [input.asOf]
 * @param {Array<{ estimateHours?: number, actualHours?: number, issueType?: string, completedAt?: *, firstInProgressAt?: *, createdAt?: *, hadRework?: boolean, hadReopen?: boolean }>} input.completedTasks
 * @param {number} [input.totalHoursLogged]
 * @param {number} [input.projectsCompleted]
 * @param {string} [input.primaryDomain]
 * @param {number} [input.approvalRejected]
 * @param {number} [input.approvalDecided]
 */
function buildUserPerformanceRollup(input = {}) {
  const windowDays = Math.max(1, Number(input.windowDays) || 90);
  const asOf = input.asOf ? new Date(input.asOf) : new Date();
  const tasks = Array.isArray(input.completedTasks) ? input.completedTasks : [];
  const tasksCompleted = tasks.length;

  const accuracyList = [];
  const biasList = [];
  const estimateList = [];
  const actualList = [];
  const cycleList = [];
  let bugCount = 0;
  let reworkCount = 0;
  let reopenCount = 0;
  let estimateHoursSum = 0;
  let actualHoursFromTasks = 0;

  for (const t of tasks) {
    const est = Number(t.estimateHours);
    const act = Number(t.actualHours);
    const type = String(t.issueType || 'task').toLowerCase();
    if (type === 'bug') bugCount += 1;
    if (t.hadRework) reworkCount += 1;
    if (t.hadReopen) reopenCount += 1;

    if (Number.isFinite(est) && est > 0) {
      estimateHoursSum += est;
      estimateList.push(est);
      if (Number.isFinite(act) && act >= 0) {
        actualHoursFromTasks += act;
        actualList.push(act);
        const acc = estimationAccuracyPct(est, act);
        if (acc != null) accuracyList.push(acc);
        const bias = estimationBiasHours(est, act);
        if (bias != null) biasList.push(bias);
      }
    } else if (Number.isFinite(act) && act >= 0) {
      actualHoursFromTasks += act;
    }

    const cycle = hoursBetween(t.completedAt, t.firstInProgressAt);
    if (cycle != null) cycleList.push(cycle);
  }

  const weeks = Math.max(windowDays / 7, 1 / 7);
  const totalHoursLogged =
    input.totalHoursLogged != null && Number.isFinite(Number(input.totalHoursLogged))
      ? round2(Number(input.totalHoursLogged))
      : round2(actualHoursFromTasks);

  const approvalDecided = Number(input.approvalDecided) || 0;
  const approvalRejected = Number(input.approvalRejected) || 0;
  const approvalRejectionRate =
    approvalDecided > 0 ? round2(approvalRejected / approvalDecided) : null;

  const confidence = confidenceFromSampleSize(tasksCompleted);
  const avgEstimateHours = average(estimateList);
  const avgActualHours = average(actualList);

  return {
    organizationId: input.organizationId != null ? String(input.organizationId) : undefined,
    userId: input.userId != null ? String(input.userId) : undefined,
    windowDays,
    asOf: asOf.toISOString(),
    sampleSize: {
      tasksCompleted,
      tasksWithEstimate: estimateList.length,
      tasksWithAccuracy: accuracyList.length,
      sprintsParticipated: Number(input.sprintsParticipated) || 0,
    },
    velocity: {
      estimateHoursPerWeek: round2(estimateHoursSum / weeks),
      actualHoursPerWeek: round2((totalHoursLogged || 0) / weeks),
      estimateHoursTotal: round2(estimateHoursSum),
      actualHoursTotal: totalHoursLogged,
    },
    cycleTimeHours: {
      average: average(cycleList),
      median: median(cycleList),
      sampleSize: cycleList.length,
    },
    estimation: {
      accuracyPct: average(accuracyList),
      avgEstimateHours,
      avgActualHours,
      biasHours: average(biasList),
    },
    quality: {
      bugRate: tasksCompleted > 0 ? round2(bugCount / tasksCompleted) : null,
      reworkRate: tasksCompleted > 0 ? round2(reworkCount / tasksCompleted) : null,
      reopenRate: tasksCompleted > 0 ? round2(reopenCount / tasksCompleted) : null,
      approvalRejectionRate,
    },
    experience: {
      projectsCompleted: Number(input.projectsCompleted) || 0,
      totalHoursLogged: totalHoursLogged || 0,
      primaryDomain: input.primaryDomain != null ? String(input.primaryDomain) : null,
    },
    confidence,
  };
}

module.exports = {
  MS_PER_HOUR,
  MS_PER_WEEK,
  MIN_SAMPLE_FOR_MEDIUM,
  MIN_SAMPLE_FOR_HIGH,
  round2,
  average,
  median,
  estimationAccuracyPct,
  estimationBiasHours,
  confidenceFromSampleSize,
  calibrateEstimateHours,
  hoursBetween,
  buildUserPerformanceRollup,
};
