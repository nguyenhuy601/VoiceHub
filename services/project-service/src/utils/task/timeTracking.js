/**
 * Phase 3b — feature flag + estimate/worklog validators (pure).
 */

function isTimeTrackingV1Enabled() {
  const raw = String(process.env.TIME_TRACKING_V1 ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

function assertTimeTrackingEnabled() {
  if (!isTimeTrackingV1Enabled()) {
    const err = new Error('Time Tracking (Estimate / Worklog) đang tắt');
    err.statusCode = 404;
    err.errorCode = 'TIME_TRACKING_DISABLED';
    throw err;
  }
}

/** @returns {number|null} */
function normalizeEstimateHours(raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('estimateHours phải là số >= 0');
    err.statusCode = 400;
    err.errorCode = 'ESTIMATE_HOURS_INVALID';
    throw err;
  }
  return Math.round(n * 100) / 100;
}

const MIN_WORKLOG_HOURS = 0.25;
const MAX_WORKLOG_HOURS = 24;

function normalizeWorklogHours(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_WORKLOG_HOURS || n > MAX_WORKLOG_HOURS) {
    const err = new Error(`hours phải từ ${MIN_WORKLOG_HOURS} đến ${MAX_WORKLOG_HOURS}`);
    err.statusCode = 400;
    err.errorCode = 'WORKLOG_HOURS_INVALID';
    throw err;
  }
  return Math.round(n * 100) / 100;
}

function normalizeWorkDate(raw) {
  const s = String(raw || '').trim();
  if (!s) {
    const err = new Error('workDate là bắt buộc (YYYY-MM-DD)');
    err.statusCode = 400;
    throw err;
  }
  const ms = Date.parse(s.includes('T') ? s : `${s}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) {
    const err = new Error('workDate không hợp lệ');
    err.statusCode = 400;
    throw err;
  }
  const d = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function varianceHours(estimateHours, actualHours) {
  const est = estimateHours == null ? null : Number(estimateHours);
  const act = Number(actualHours) || 0;
  if (est == null || !Number.isFinite(est)) {
    return { estimateHours: null, actualHours: act, varianceHours: null };
  }
  return {
    estimateHours: est,
    actualHours: act,
    varianceHours: Math.round((act - est) * 100) / 100,
  };
}

function sumWorklogHours(rows = []) {
  return (
    Math.round((rows || []).reduce((s, r) => s + (Number(r.hours) || 0), 0) * 100) / 100
  );
}

module.exports = {
  isTimeTrackingV1Enabled,
  assertTimeTrackingEnabled,
  normalizeEstimateHours,
  normalizeWorklogHours,
  normalizeWorkDate,
  varianceHours,
  sumWorklogHours,
  MIN_WORKLOG_HOURS,
  MAX_WORKLOG_HOURS,
  DEFAULT_HOURS_PER_DAY: 8,
};
