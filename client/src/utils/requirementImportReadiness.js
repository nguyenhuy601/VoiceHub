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
  return preview.planningReadiness?.allLeavesStaffed === true;
}

export function resolvePlanningReadinessFromPreview(preview) {
  return preview?.planningReadiness || null;
}

export function resolvePlanningReadinessFromPack(pack) {
  return pack?.planningReadiness || null;
}
