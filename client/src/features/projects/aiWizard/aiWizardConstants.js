/**
 * CreateProjectAiWizard renders source → analysis → confirm only.
 * Legacy planning/review/assign step components are unused (do not re-add without UI).
 */
export const AI_WIZARD_STEPS = Object.freeze([
  { id: 'source', labelKey: 'aiCreateWizard.stepSource' },
  { id: 'analysis', labelKey: 'aiCreateWizard.stepAnalysis' },
  { id: 'confirm', labelKey: 'aiCreateWizard.stepConfirm' },
]);

export const AI_WIZARD_PACK_PAGE_SIZE = 4;

/** Pack may proceed to AI Analysis when lifecycle is approved or already linked. */
export function canRunAiOnPack(pack) {
  if (!pack) return false;
  const st = String(pack.status || '').toLowerCase();
  return st === 'approved' || st === 'project_linked';
}

export function unwrapRequirementPayload(res) {
  return res?.data?.data ?? res?.data ?? res;
}
