/**
 * Gate 2 review lane — parallel domain review, then PM consolidation, then PO final.
 * SoT: pack.aiAnalysis.gate2.reviewLane
 *
 * parallel → (all tracks submitted) consolidation
 *   → propose change → reconfirm (owner accept/reject, or PO risk escalation)
 *   → no blocking issues → po_final → done
 *
 * Legacy sequential pm/tech map to parallel. Legacy po (waiting final) maps to po_final.
 */

const REVIEW_LANE = Object.freeze({
  PARALLEL: 'parallel',
  CONSOLIDATION: 'consolidation',
  RECONFIRM: 'reconfirm',
  PO_FINAL: 'po_final',
  DONE: 'done',
  /** @deprecated sequential — resolved as parallel */
  PM: 'pm',
  /** @deprecated sequential — resolved as parallel */
  TECH: 'tech',
  /** @deprecated sequential waiting PO — resolved as po_final */
  PO: 'po',
});

const LANE_SET = new Set(Object.values(REVIEW_LANE));

function resolveGate2ReviewLane(pack) {
  const raw = String(pack?.aiAnalysis?.gate2?.reviewLane || '')
    .trim()
    .toLowerCase();

  const howStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '')
    .trim()
    .toLowerCase();
  if (howStatus === 'confirmed') return REVIEW_LANE.DONE;

  const packStatus = String(pack?.status || '').trim().toLowerCase();
  if (packStatus === 'project_linked') return REVIEW_LANE.DONE;

  if (raw === REVIEW_LANE.DONE) return REVIEW_LANE.DONE;
  if (raw === REVIEW_LANE.PO || raw === REVIEW_LANE.PO_FINAL) return REVIEW_LANE.PO_FINAL;
  if (raw === REVIEW_LANE.CONSOLIDATION) return REVIEW_LANE.CONSOLIDATION;
  if (raw === REVIEW_LANE.RECONFIRM) return REVIEW_LANE.RECONFIRM;
  if (
    raw === REVIEW_LANE.PARALLEL ||
    raw === REVIEW_LANE.PM ||
    raw === REVIEW_LANE.TECH
  ) {
    return REVIEW_LANE.PARALLEL;
  }

  if (LANE_SET.has(raw)) return raw;

  if (packStatus === 'approved' || howStatus === 'ready') {
    return REVIEW_LANE.PARALLEL;
  }

  return REVIEW_LANE.PARALLEL;
}

function assertActorMayActOnLane(action, lane) {
  const act = String(action || '').trim().toLowerCase();
  const effective = String(lane || '').trim().toLowerCase();

  if (act === 'po_approve' || act === 'po_reject') {
    if (effective === REVIEW_LANE.PO_FINAL || effective === REVIEW_LANE.PO) {
      return { ok: true, lane: effective };
    }
    const err = new Error(
      effective === REVIEW_LANE.PARALLEL
        ? 'Ba bên đang review song song. PO xác nhận cuối sau khi PM tổng hợp.'
        : effective === REVIEW_LANE.CONSOLIDATION || effective === REVIEW_LANE.RECONFIRM
          ? 'PM đang tổng hợp. PO duyệt cuối khi kế hoạch đã nhất quán.'
          : 'Gate 2 không ở trạng thái chờ PO duyệt cuối.'
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
