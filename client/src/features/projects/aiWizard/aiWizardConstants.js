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

export function initLeafAssignMapFromOverlay(overlay = {}) {
  const map = {};
  for (const row of overlay?.leafAssignments || []) {
    const ext = String(row.externalId || '').trim();
    if (!ext) continue;
    map[ext] = row.suggestedUserId ? String(row.suggestedUserId) : '';
  }
  return map;
}

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
