/**
 * Pure gate: qa_uat → release_handover (DEC C1–C2).
 * @returns {{ ok: boolean, blockers: string[] }}
 */
function assertHandoverGate({
  releaseReadyStatus = 'none',
  uatStatus = 'none',
  handoverChecklist = {},
  checklistIds = [],
} = {}) {
  const blockers = [];
  const ready = String(releaseReadyStatus || 'none').toLowerCase();
  const uat = String(uatStatus || 'none').toLowerCase();
  const checklist =
    handoverChecklist && typeof handoverChecklist === 'object' && !Array.isArray(handoverChecklist)
      ? handoverChecklist
      : {};
  const ids = Array.isArray(checklistIds) ? checklistIds.filter(Boolean) : [];

  if (ready !== 'confirmed') blockers.push('release_ready_not_confirmed');
  if (uat !== 'pass') blockers.push('uat_not_pass');

  for (const id of ids) {
    if (checklist[id] !== true) blockers.push(`checklist_${id}`);
  }

  return {
    ok: blockers.length === 0,
    blockers,
  };
}

module.exports = {
  assertHandoverGate,
};
