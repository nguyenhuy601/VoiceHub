/**
 * Gate 2 sequential review lane — PM then PO (FE mirror of BE SoT).
 */

export const GATE2_REVIEW_LANE = Object.freeze({
  PM: 'pm',
  PO: 'po',
  DONE: 'done',
});

const LANE_SET = new Set(Object.values(GATE2_REVIEW_LANE));

/**
 * Resolve effective lane with legacy compat (mirror BE).
 */
export function resolveGate2ReviewLane(pack) {
  const raw = String(pack?.aiAnalysis?.gate2?.reviewLane || '')
    .trim()
    .toLowerCase();
  if (LANE_SET.has(raw)) return raw;

  const howStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '')
    .trim()
    .toLowerCase();
  if (howStatus === 'confirmed') return GATE2_REVIEW_LANE.DONE;

  const packStatus = String(pack?.status || '').trim().toLowerCase();
  if (packStatus === 'project_linked') return GATE2_REVIEW_LANE.DONE;

  if (packStatus === 'approved' || howStatus === 'ready') {
    return GATE2_REVIEW_LANE.PM;
  }

  return GATE2_REVIEW_LANE.PM;
}

/**
 * What the Review tab should show for this actor.
 * RULE: PO never gets PM decide panel — even if also canReviewPlanningPm (dual).
 * @returns {'showPmPanel'|'showPoPanel'|'waitingPm'|'waitingPo'|'done'|'howPending'}
 */
export function resolveGate2ReviewView({
  lane,
  howStatus = '',
  canReviewPm = false,
  canReviewPo = false,
}) {
  const how = String(howStatus || '')
    .trim()
    .toLowerCase();
  if (how === 'pending' || how === 'running' || how === 'queued') {
    return 'howPending';
  }

  const effective = String(lane || '')
    .trim()
    .toLowerCase();

  if (effective === GATE2_REVIEW_LANE.DONE || how === 'confirmed') return 'done';

  // HOW not ready yet — wait on Monitor / start CTA
  if (how && how !== 'ready' && how !== 'confirmed') {
    return 'howPending';
  }
  if (!how || how === 'empty') {
    return 'howPending';
  }

  if (effective === GATE2_REVIEW_LANE.PM) {
    if (canReviewPo) return 'waitingPm';
    if (canReviewPm) return 'showPmPanel';
    return 'waitingPm';
  }

  if (effective === GATE2_REVIEW_LANE.PO) {
    if (canReviewPo) return 'showPoPanel';
    return 'waitingPo';
  }

  return 'waitingPm';
}

export default resolveGate2ReviewLane;
