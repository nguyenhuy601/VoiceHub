export const AI_WIZARD_STEPS = Object.freeze([
  { id: 'source', labelKey: 'aiCreateWizard.stepSource' },
  { id: 'planning', labelKey: 'aiCreateWizard.stepPlanning' },
  { id: 'review', labelKey: 'aiCreateWizard.stepReview' },
  { id: 'confirm', labelKey: 'aiCreateWizard.stepConfirm' },
]);

export function canRunAiOnPack(pack) {
  const status = String(pack?.status || '');
  if (!['under_review', 'approved', 'project_linked'].includes(status)) return false;
  const readiness = pack?.planningReadiness;
  if (!readiness) return false;
  if (readiness.allLeavesStaffed !== true) return false;
  return true;
}

export function unwrapRequirementPayload(res) {
  return res?.data?.data ?? res?.data ?? res;
}
