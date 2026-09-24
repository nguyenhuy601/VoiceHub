/**
 * Pure gate: qa_uat → release_handover (Chuẩn Vàng DEC).
 * Entry = Release Ready confirmed + UAT Pass only.
 * Checklist/evidence are Phase 4 work — not entry blockers.
 * @returns {{ ok: boolean, blockers: string[] }}
 */
function assertHandoverGate({
  releaseReadyStatus = 'none',
  uatStatus = 'none',
  // Kept for call-site compat; ignored for entry (RULE-02).
  handoverChecklist: _handoverChecklist = {},
  checklistIds: _checklistIds = [],
} = {}) {
  const blockers = [];
  const ready = String(releaseReadyStatus || 'none').toLowerCase();
  const uat = String(uatStatus || 'none').toLowerCase();

  if (ready !== 'confirmed') blockers.push('release_ready_not_confirmed');
  if (uat !== 'pass') blockers.push('uat_not_pass');

  return {
    ok: blockers.length === 0,
    blockers,
  };
}

module.exports = {
  assertHandoverGate,
};
