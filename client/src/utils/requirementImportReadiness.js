/**
 * Shared readiness helpers for requirement import preview / confirm.
 */

export function getPlanningReadinessTone(readiness) {
  if (!readiness || readiness.score == null) return 'muted';
  if (readiness.allLeavesStaffed !== true) return 'destructive';
  if (readiness.score >= 80) return 'success';
  return 'warning';
}

export function canConfirmRequirementImport(preview) {
  if (!preview?.valid || preview.errorCount > 0) return false;
  return isPackWhatReady(preview.planningReadiness);
}

/** Pack / readiness đủ WHAT (mọi leaf đã staff) — dùng UI confirm. */
export function isPackWhatReady(readiness) {
  return readiness?.allLeavesStaffed === true;
}

/**
 * Suffix i18n cho nút confirm (`stringKey(variant, suffix)` → requirements.*).
 */
export function getConfirmImportLabelKey(preview) {
  if (!preview?.valid || Number(preview.errorCount) > 0) {
    return 'confirmImportBlockedValidation';
  }
  if (!isPackWhatReady(preview.planningReadiness)) {
    return 'confirmImportBlockedStaffing';
  }
  return 'confirmImport';
}

export function resolvePlanningReadinessFromPreview(preview) {
  return preview?.planningReadiness || null;
}

export function resolvePlanningReadinessFromPack(pack) {
  return pack?.planningReadiness || null;
}
