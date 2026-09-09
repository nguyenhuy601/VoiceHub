/**
 * Shared readiness helpers for requirement import preview / confirm (WHAT-only).
 */

export function getPlanningReadinessTone(readiness) {
  if (!readiness || readiness.score == null) return 'muted';
  const ready =
    readiness.canRunAiAnalysis === true || readiness.allLeavesStaffed === true;
  if (!ready) return 'destructive';
  if (readiness.score >= 80) return 'success';
  return 'warning';
}

export function isPackWhatReady(readiness) {
  if (!readiness) return false;
  if (readiness.canRunAiAnalysis === true) return true;
  return readiness.allLeavesStaffed === true;
}

export function canConfirmRequirementImport(preview) {
  if (!preview?.valid || Number(preview.errorCount) > 0) return false;
  if (preview.canRunAiAnalysis === false) return false;
  return true;
}

/** Confirm CTA: Continue Anyway when warnings-only (0 errors). */
export function getConfirmImportLabelKey(preview) {
  if (preview?.valid && Number(preview.warningCount) > 0 && Number(preview.errorCount || 0) === 0) {
    return 'continueAnyway';
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
