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

/** Spec: submittedEarlyHours = max(0, estimate - actual) — derive, không ghi Mongo. */
function submittedEarlyHours(estimateHours, actualHours) {
  const est = estimateHours == null ? null : Number(estimateHours);
  const act = Number(actualHours) || 0;
  if (est == null || !Number.isFinite(est)) return null;
  return Math.round(Math.max(0, est - act) * 100) / 100;
}

/**
 * Aggregate-on-read: map parentTaskId → sum actual of self + descendants.
 * Pure — tasks: [{_id, parentTaskId?, epicId?, estimateHours?}], logs: [{taskId, hours}].
 */
function buildHierarchyActualRollup(tasks = [], logs = []) {
  const byTaskHours = new Map();
  for (const row of logs || []) {
    const tid = String(row?.taskId || '').trim();
    if (!tid) continue;
    byTaskHours.set(tid, (byTaskHours.get(tid) || 0) + (Number(row.hours) || 0));
  }

  const childrenOf = new Map();
  const byEpic = new Map();
  for (const t of tasks || []) {
    const id = String(t?._id || t?.id || '').trim();
    if (!id) continue;
    const parentId = String(t?.parentTaskId || '').trim();
    if (parentId) {
      if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
      childrenOf.get(parentId).push(id);
    }
    const epicId = String(t?.epicId || '').trim();
    if (epicId) {
      if (!byEpic.has(epicId)) byEpic.set(epicId, []);
      byEpic.get(epicId).push(id);
    }
  }

  function collectDescendants(rootId, depth = 0, seen = new Set()) {
    if (!rootId || seen.has(rootId) || depth > 8) return [];
    seen.add(rootId);
    const kids = childrenOf.get(rootId) || [];
    const out = [...kids];
    for (const kid of kids) {
      out.push(...collectDescendants(kid, depth + 1, seen));
    }
    return out;
  }

  const byParent = {};
  for (const t of tasks || []) {
    const id = String(t?._id || t?.id || '').trim();
    if (!id) continue;
    const descendantIds = collectDescendants(id);
    const ids = [id, ...descendantIds];
    const own = byTaskHours.get(id) || 0;
    const rolled = ids.reduce((s, tid) => s + (byTaskHours.get(tid) || 0), 0);
    const estimate = t?.estimateHours;
    byParent[id] = {
      taskId: id,
      ownActualHours: Math.round(own * 100) / 100,
      rolledActualHours: Math.round(rolled * 100) / 100,
      descendantCount: descendantIds.length,
      ...varianceHours(estimate, rolled),
      submittedEarlyHours: submittedEarlyHours(estimate, rolled),
    };
  }

  const byEpicRollup = {};
  for (const [epicId, taskIds] of byEpic.entries()) {
    const rolled = taskIds.reduce((s, tid) => s + (byTaskHours.get(tid) || 0), 0);
    byEpicRollup[epicId] = {
      epicId,
      taskCount: taskIds.length,
      rolledActualHours: Math.round(rolled * 100) / 100,
    };
  }

  return { byParent, byEpic: byEpicRollup };
}

module.exports = {
  isTimeTrackingV1Enabled,
  assertTimeTrackingEnabled,
  normalizeEstimateHours,
  normalizeWorklogHours,
  normalizeWorkDate,
  varianceHours,
  sumWorklogHours,
  submittedEarlyHours,
  buildHierarchyActualRollup,
  MIN_WORKLOG_HOURS,
  MAX_WORKLOG_HOURS,
  DEFAULT_HOURS_PER_DAY: 8,
};
