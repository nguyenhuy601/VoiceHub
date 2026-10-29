/**
 * Confirm-only response after Gate2 PO approve (RULE-S1: approve ≠ promote).
 */

function buildGate2PoApproveConfirmResult(pack, { reviewLaneDone = 'DONE' } = {}) {
  return {
    phase: 'how',
    job: 'phase_how',
    status: 'confirmed',
    reviewLane: reviewLaneDone,
    schemaVersion: pack?.aiAnalysis?.schemaVersion,
    promoted: false,
    promote: null,
    promoteError: null,
    project: null,
    pack: null,
  };
}

module.exports = {
  buildGate2PoApproveConfirmResult,
};
