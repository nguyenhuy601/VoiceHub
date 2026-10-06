/**
 * Gate 1 sequential review lane — BA then PO (SoT on pack.aiAnalysis.gate1.reviewLane).
 */

const REVIEW_LANE = Object.freeze({
  BA: 'ba',
  PO: 'po',
  DONE: 'done',
});

const LANE_SET = new Set(Object.values(REVIEW_LANE));

/**
 * Resolve effective lane with legacy compat.
 * - explicit reviewLane if valid
 * - under_review / approved|project_linked → po / done
 * - WHAT ready / srsProposal → ba
 * - else ba (safe default for AI path)
 */
function resolveGate1ReviewLane(pack) {
  const raw = String(pack?.aiAnalysis?.gate1?.reviewLane || '')
    .trim()
    .toLowerCase();
  if (LANE_SET.has(raw)) return raw;

  const status = String(pack?.status || '').trim().toLowerCase();
  if (status === 'approved' || status === 'project_linked') return REVIEW_LANE.DONE;
  if (status === 'under_review') return REVIEW_LANE.PO;

  const whatStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_what?.status || '')
    .trim()
    .toLowerCase();
  const hasProposal = Boolean(pack?.aiAnalysis?.analyses?.srsProposal);
  if (whatStatus === 'ready' || hasProposal) return REVIEW_LANE.BA;

  return REVIEW_LANE.BA;
}

/**
 * @param {'submit'|'approve'|'reject'} action
 * @param {string} lane — effective lane
 */
function assertActorMayActOnLane(action, lane) {
  const act = String(action || '').trim().toLowerCase();
  const effective = String(lane || '').trim().toLowerCase();

  if (act === 'submit') {
    // BA may confirm (ba) or withdraw+resubmit while waiting PO (po). Not after done.
    if (effective === REVIEW_LANE.BA || effective === REVIEW_LANE.PO) {
      return { ok: true, lane: effective };
    }
    const err = new Error('Không thể gửi duyệt Gate 1 ở lane hiện tại.');
    err.statusCode = 409;
    err.errorCode = 'GATE1_WRONG_LANE';
    err.details = { action: 'submit', reviewLane: effective };
    throw err;
  }

  if (act === 'approve' || act === 'reject') {
    if (effective === REVIEW_LANE.PO) return { ok: true, lane: effective };
    const err = new Error(
      effective === REVIEW_LANE.BA
        ? 'Chờ BA xác nhận duyệt trước khi PO duyệt / từ chối.'
        : 'Gate 1 không ở trạng thái chờ PO duyệt.'
    );
    err.statusCode = 409;
    err.errorCode = 'GATE1_WRONG_LANE';
    err.details = { action: act, reviewLane: effective };
    throw err;
  }

  const err = new Error(`Unknown Gate1 lane action: ${act}`);
  err.statusCode = 400;
  err.errorCode = 'GATE1_LANE_ACTION_INVALID';
  throw err;
}

function stampGate1ReviewLane(container, lane) {
  const next = container && typeof container === 'object' ? container : {};
  const value = String(lane || '').trim().toLowerCase();
  if (!LANE_SET.has(value)) return next;
  next.gate1 = {
    ...(next.gate1 || {}),
    reviewLane: value,
    reviewLaneUpdatedAt: new Date().toISOString(),
  };
  return next;
}

module.exports = {
  REVIEW_LANE,
  resolveGate1ReviewLane,
  assertActorMayActOnLane,
  stampGate1ReviewLane,
};
