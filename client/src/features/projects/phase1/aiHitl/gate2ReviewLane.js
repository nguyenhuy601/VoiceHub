/**
 * Gate 2 — parallel domain review, PM consolidation, PO final (FE mirror).
 */

import { isBlockingProposal } from './gate2ReviewOwnership.js';

export const GATE2_REVIEW_LANE = Object.freeze({
  PARALLEL: 'parallel',
  CONSOLIDATION: 'consolidation',
  RECONFIRM: 'reconfirm',
  PO_FINAL: 'po_final',
  DONE: 'done',
});

function trackStatus(tracks, key, { techRequired = true } = {}) {
  const status = String(tracks?.[key]?.status || '').trim().toLowerCase();
  if (status === 'submitted' || status === 'skipped' || status === 'pending') return status;
  if (key === 'tech' && !techRequired) return 'skipped';
  return 'pending';
}

export function resolveGate2ReviewLane(pack) {
  const raw = String(pack?.aiAnalysis?.gate2?.reviewLane || '')
    .trim()
    .toLowerCase();
  const howStatus = String(pack?.aiAnalysis?.phaseRuns?.phase_how?.status || '')
    .trim()
    .toLowerCase();
  if (howStatus === 'confirmed') return GATE2_REVIEW_LANE.DONE;
  const packStatus = String(pack?.status || '').trim().toLowerCase();
  if (packStatus === 'project_linked') return GATE2_REVIEW_LANE.DONE;
  if (raw === 'done') return GATE2_REVIEW_LANE.DONE;
  if (raw === 'po' || raw === 'po_final') return GATE2_REVIEW_LANE.PO_FINAL;
  if (raw === 'consolidation') return GATE2_REVIEW_LANE.CONSOLIDATION;
  if (raw === 'reconfirm') return GATE2_REVIEW_LANE.RECONFIRM;
  if (raw === 'parallel' || raw === 'pm' || raw === 'tech') return GATE2_REVIEW_LANE.PARALLEL;
  if (packStatus === 'approved' || howStatus === 'ready') return GATE2_REVIEW_LANE.PARALLEL;
  return GATE2_REVIEW_LANE.PARALLEL;
}

/**
 * @returns {'showParallel'|'showConsolidation'|'showChangeConfirm'|'showPoPanel'|'waitingParallel'|'waitingConsolidation'|'waitingPo'|'done'|'howPending'}
 */
export function resolveGate2ReviewView({
  lane,
  howStatus = '',
  canReviewPm = false,
  canReviewTech = false,
  canReviewPo = false,
  tracks = null,
  proposals = [],
  techRequired = true,
  userId = '',
}) {
  const how = String(howStatus || '').trim().toLowerCase();
  if (how === 'pending' || how === 'running' || how === 'queued') return 'howPending';

  const effective = String(lane || '').trim().toLowerCase();
  if (effective === GATE2_REVIEW_LANE.DONE || how === 'confirmed') return 'done';
  if (how && how !== 'ready' && how !== 'confirmed') return 'howPending';
  if (!how || how === 'empty') return 'howPending';

  const actor = String(userId || '').trim();
  const list = Array.isArray(proposals) ? proposals : [];

  if (effective === GATE2_REVIEW_LANE.PARALLEL || effective === 'pm' || effective === 'tech') {
    const openPo = canReviewPo && trackStatus(tracks, 'po', { techRequired }) === 'pending';
    const openTech = canReviewTech && trackStatus(tracks, 'tech', { techRequired }) === 'pending';
    const openPm = canReviewPm && trackStatus(tracks, 'pm', { techRequired }) === 'pending';
    if (openPo || openTech || openPm) return 'showParallel';
    return 'waitingParallel';
  }

  if (
    effective === GATE2_REVIEW_LANE.CONSOLIDATION ||
    effective === GATE2_REVIEW_LANE.RECONFIRM
  ) {
    const canDecide = list.some((row) => {
      if (row.status === 'pending' && row.proposedBy !== actor) {
        if (row.owner === 'tech' && canReviewTech) return true;
        if (row.owner === 'po' && canReviewPo) return true;
      }
      if (row.status === 'escalated' && canReviewPo && row.proposedBy !== actor) return true;
      return false;
    });
    if (canDecide) return 'showChangeConfirm';
    if (canReviewPm) return 'showConsolidation';
    return 'waitingConsolidation';
  }

  if (effective === GATE2_REVIEW_LANE.PO_FINAL || effective === 'po') {
    if (canReviewPo) return 'showPoPanel';
    return 'waitingPo';
  }

  return 'waitingParallel';
}

export function openParallelTracks({
  canReviewPm = false,
  canReviewTech = false,
  canReviewPo = false,
  tracks = null,
  techRequired = true,
}) {
  const out = [];
  if (canReviewPo && trackStatus(tracks, 'po', { techRequired }) === 'pending') out.push('po');
  if (canReviewTech && trackStatus(tracks, 'tech', { techRequired }) === 'pending') out.push('tech');
  if (canReviewPm && trackStatus(tracks, 'pm', { techRequired }) === 'pending') out.push('pm');
  return out;
}

export { isBlockingProposal };
export default resolveGate2ReviewLane;
