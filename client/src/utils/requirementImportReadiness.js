/**
 * Shared readiness helpers for requirement import preview / confirm (WHAT-only).
 * AI gate (`canRunAiAnalysis`) — NhatHuy; label blocked keys — Phase1 CongDanh.
 */

export function getPlanningReadinessTone(readiness) {
  if (!readiness || readiness.score == null) return 'muted';
  const ready =
    readiness.canRunAiAnalysis === true || readiness.allLeavesStaffed === true;
  if (!ready) return 'destructive';
  if (readiness.score >= 80) return 'success';
  return 'warning';
}

/** Pack / readiness đủ WHAT (AI analysis sẵn sàng hoặc mọi leaf đã staff). */
export function isPackWhatReady(readiness) {
  if (!readiness) return false;
  if (readiness.canRunAiAnalysis === true) return true;
  return readiness.allLeavesStaffed === true;
}

export function canConfirmRequirementImport(preview) {
  if (!preview?.valid || Number(preview.errorCount) > 0) return false;
  if (preview.canRunAiAnalysis === false) return false;
  return isPackWhatReady(preview.planningReadiness);
}

/**
 * Suffix i18n cho nút confirm (`stringKey(variant, suffix)` → requirements.*).
 */
export function getConfirmImportLabelKey(preview) {
  if (!preview?.valid || Number(preview.errorCount) > 0) {
    return 'confirmImportBlockedValidation';
  }
  if (preview.canRunAiAnalysis === false || !isPackWhatReady(preview.planningReadiness)) {
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

/** @deprecated Legacy AI Planning removed — always false. Prefer AI Analysis Blueprint. */
export function isLegacyAiPlanningEnabled() {
  return false;
}
