/**
 * Gate 2 sequential review lane — PM then PO (SoT on pack.aiAnalysis.gate2.reviewLane).
 * Planning ownership (DEC): PM chủ trì plan → PO business accept. Không dùng BA.
 */

const REVIEW_LANE = Object.freeze({
  PM: 'pm',
  PO: 'po',
  DONE: 'done',
});

const LANE_SET = new Set(Object.values(REVIEW_LANE));

/**
 * Resolve effective lane with legacy compat.
 * - explicit reviewLane if valid
 * - phase_how confirmed / project_linked → done
 * - pack approved + phase_how ready → pm (default wait PM)
 * - else pm when Gate1 done
 */
function resolveGate2ReviewLane(pack) {
  const raw = String(pack?.aiAnalysis?.gate2?.reviewLane || '')
    .trim()
    .toLowerCase();
  if (LANE_SET.has(raw)) return raw;

  const howStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '')
    .trim()
    .toLowerCase();
  if (howStatus === 'confirmed') return REVIEW_LANE.DONE;

  const packStatus = String(pack?.status || '').trim().toLowerCase();
  if (packStatus === 'project_linked') return REVIEW_LANE.DONE;

  if (packStatus === 'approved' || howStatus === 'ready') {
    return REVIEW_LANE.PM;
  }

  return REVIEW_LANE.PM;
}

/**
 * @param {'pm_submit'|'po_approve'|'po_reject'} action
 * @param {string} lane
 */
function assertActorMayActOnLane(action, lane) {
  const act = String(action || '').trim().toLowerCase();
  const effective = String(lane || '').trim().toLowerCase();

  if (act === 'pm_submit') {
    if (effective === REVIEW_LANE.PM || effective === REVIEW_LANE.PO) {
      return { ok: true, lane: effective };
    }
    const err = new Error('Không thể gửi duyệt Gate 2 ở lane hiện tại.');
    err.statusCode = 409;
    err.errorCode = 'GATE2_WRONG_LANE';
    err.details = { action: 'pm_submit', reviewLane: effective };
    throw err;
  }

  if (act === 'po_approve' || act === 'po_reject') {
    if (effective === REVIEW_LANE.PO) return { ok: true, lane: effective };
    const err = new Error(
      effective === REVIEW_LANE.PM
        ? 'Chờ PM xác nhận kế hoạch trước khi PO duyệt / từ chối.'
        : 'Gate 2 không ở trạng thái chờ PO duyệt.'
    );
    err.statusCode = 409;
    err.errorCode = 'GATE2_WRONG_LANE';
    err.details = { action: act, reviewLane: effective };
    throw err;
  }

  const err = new Error(`Unknown Gate2 lane action: ${act}`);
  err.statusCode = 400;
  err.errorCode = 'GATE2_LANE_ACTION_INVALID';
  throw err;
}

function stampGate2ReviewLane(container, lane, extra = {}) {
  const next = container && typeof container === 'object' ? container : {};
  const value = String(lane || '').trim().toLowerCase();
  if (!LANE_SET.has(value)) return next;
  next.gate2 = {
    ...(next.gate2 || {}),
    ...extra,
    reviewLane: value,
    reviewLaneUpdatedAt: new Date().toISOString(),
  };
  return next;
}

module.exports = {
  REVIEW_LANE,
  resolveGate2ReviewLane,
  assertActorMayActOnLane,
  stampGate2ReviewLane,
};
