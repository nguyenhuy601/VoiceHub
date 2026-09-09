/**
 * Resolve planning capacity window from explicit dates or RequirementPack.
 * Pure when packDoc is provided; async load optional via loadPack callback.
 */

const { DAY_MS, toDayMs } = require('./allocationOverlap');

const MAX_WINDOW_DAYS = 366;

function httpError(message, statusCode, errorCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function toIsoDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function inclusiveDaySpan(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / DAY_MS) + 1;
}

/**
 * Validate and normalize an inclusive [fromMs, toMs] window.
 * @returns {{ fromMs: number, toMs: number, from: string, to: string }}
 */
function assertValidWindow(fromMs, toMs, { source = 'explicit' } = {}) {
  if (fromMs == null || toMs == null) {
    throw httpError(
      'fromDate/toDate (YYYY-MM-DD) không hợp lệ hoặc thiếu',
      400,
      source === 'pack' ? 'PLANNING_WINDOW_INCOMPLETE' : 'PLANNING_WINDOW_INVALID'
    );
  }
  if (toMs < fromMs) {
    throw httpError('toDate phải ≥ fromDate', 400, 'PLANNING_WINDOW_INVALID');
  }
  const days = inclusiveDaySpan(fromMs, toMs);
  if (days > MAX_WINDOW_DAYS) {
    throw httpError(
      `Khoảng ngày tối đa ${MAX_WINDOW_DAYS} ngày (nhận ${days})`,
      400,
      'PLANNING_WINDOW_TOO_LONG'
    );
  }
  return {
    fromMs,
    toMs,
    from: toIsoDay(fromMs),
    to: toIsoDay(toMs),
    source,
  };
}

/**
 * Extract start/deadline from a RequirementPack lean/doc.
 */
function datesFromPack(pack) {
  const staffingStart = pack?.staffingPlan?.startDate;
  const overviewStart = pack?.overview?.startDate;
  const deadline = pack?.overview?.deadline;
  const fromMs = toDayMs(staffingStart || overviewStart);
  const toMs = toDayMs(deadline);
  return { fromMs, toMs };
}

/**
 * Resolve planning window.
 * Priority: explicit fromDate+toDate → requirementPackId/packDoc → null (snapshot-only).
 *
 * @param {{
 *   fromDate?: string,
 *   toDate?: string,
 *   requirementPackId?: string,
 *   organizationId?: string,
 *   packDoc?: object|null,
 *   loadPack?: (packId: string, orgId: string) => Promise<object|null>,
 * }} opts
 * @returns {Promise<null|{ fromMs, toMs, from, to, source }>}
 */
async function resolvePlanningWindow({
  fromDate,
  toDate,
  requirementPackId,
  organizationId,
  packDoc = null,
  loadPack,
} = {}) {
  const hasFrom = fromDate != null && String(fromDate).trim() !== '';
  const hasTo = toDate != null && String(toDate).trim() !== '';

  if (hasFrom || hasTo) {
    if (!hasFrom || !hasTo) {
      throw httpError(
        'Cần cả fromDate và toDate (YYYY-MM-DD)',
        400,
        'PLANNING_WINDOW_INVALID'
      );
    }
    return assertValidWindow(toDayMs(fromDate), toDayMs(toDate), { source: 'explicit' });
  }

  const packId = String(requirementPackId || '').trim();
  if (!packId) return null;

  let pack = packDoc;
  if (!pack) {
    if (typeof loadPack !== 'function') {
      throw httpError(
        'Không tải được RequirementPack cho planning window',
        400,
        'PLANNING_WINDOW_INCOMPLETE'
      );
    }
    pack = await loadPack(packId, String(organizationId || '').trim());
  }
  if (!pack) {
    throw httpError('Requirement pack không tồn tại', 404, 'REQUIREMENT_PACK_NOT_FOUND');
  }

  const { fromMs, toMs } = datesFromPack(pack);
  if (fromMs == null || toMs == null) {
    throw httpError(
      'Pack thiếu startDate hoặc deadline cho planning window',
      400,
      'PLANNING_WINDOW_INCOMPLETE'
    );
  }
  return assertValidWindow(fromMs, toMs, { source: 'pack' });
}

module.exports = {
  MAX_WINDOW_DAYS,
  assertValidWindow,
  datesFromPack,
  resolvePlanningWindow,
  inclusiveDaySpan,
};
