/**
 * Gate 1 sequential review lane — BA then PO (FE mirror of BE SoT).
 */

export const REVIEW_LANE = Object.freeze({
  BA: 'ba',
  PO: 'po',
  DONE: 'done',
});

const LANE_SET = new Set(Object.values(REVIEW_LANE));

/**
 * Resolve effective lane with legacy compat (mirror BE).
 */
export function resolveGate1ReviewLane(pack) {
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
 * What the Review tab should show for this actor.
 * RULE: Approver (PO) never gets BA decide panel — even if also canSubmit (job-title dual).
 * @returns {'showBaPanel'|'showPoPanel'|'waitingBa'|'waitingPo'|'done'}
 */
export function resolveGate1ReviewView({ lane, canSubmit = false, canApprove = false }) {
  const effective = String(lane || '')
    .trim()
    .toLowerCase();

  if (effective === REVIEW_LANE.DONE) return 'done';

  if (effective === REVIEW_LANE.BA) {
    // SoD: PO/approver waits — do not show BA Analysis Review
    if (canApprove) return 'waitingBa';
    if (canSubmit) return 'showBaPanel';
    return 'waitingBa';
  }

  if (effective === REVIEW_LANE.PO) {
    if (canApprove) return 'showPoPanel';
    return 'waitingPo';
  }

  return 'waitingBa';
}

export default resolveGate1ReviewLane;
