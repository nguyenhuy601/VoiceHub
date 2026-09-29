/**
 * Landing tabs follow status. deliveryPhase wins when the stored status is stale,
 * except on_hold and closed.
 */
export const PROJECT_COMPLETED_STATUSES = Object.freeze(
  new Set(['closed', 'completed', 'archived', 'cancelled', 'canceled'])
);

const STATUS_FOR_DELIVERY_PHASE = Object.freeze({
  requirement_analysis: 'draft',
  delivery_planning: 'ready',
  development: 'in_development',
  qa_uat: 'qa_uat',
  release_handover: 'release_handover',
});

/** Phase 2–4 share the active tab. `on_hold` is a pause, not a phase. */
const PROJECT_ACTIVE_STATUSES = Object.freeze(
  new Set(['in_development', 'qa_uat', 'release_handover', 'on_hold', 'active'])
);

export function landingStatusForUi(projectRaw = null) {
  const st = String(projectRaw?.status || '')
    .trim()
    .toLowerCase();
  if (st === 'on_hold' || PROJECT_COMPLETED_STATUSES.has(st)) return st;
  const phase = String(projectRaw?.deliveryPhase || '')
    .trim()
    .toLowerCase();
  if (STATUS_FOR_DELIVERY_PHASE[phase]) return STATUS_FOR_DELIVERY_PHASE[phase];
  // Phase trống: hub ép thành development. Tab landing dùng cùng rule.
  if (!phase) return STATUS_FOR_DELIVERY_PHASE.development;
  if (st === 'planning' || st === 'new' || st === 'created') return 'draft';
  if (st === 'ready_for_planning') return 'ready';
  if (st === 'active') return 'in_development';
  return st;
}

export function isProjectCompletedForUi(projectRaw = null) {
  const st = String(projectRaw?.status || '').toLowerCase();
  return PROJECT_COMPLETED_STATUSES.has(st) || projectRaw?.isActive === false;
}

/** Tab Đã hoàn thành: status đóng, vẫn còn trên danh sách (isActive). */
export function isProjectFinishedForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  return PROJECT_COMPLETED_STATUSES.has(landingStatusForUi(projectRaw));
}

export function isProjectDraftForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  return landingStatusForUi(projectRaw) === 'draft';
}

export function isProjectReadyForPlanningForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  return landingStatusForUi(projectRaw) === 'ready';
}

export function isProjectActiveForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  return PROJECT_ACTIVE_STATUSES.has(landingStatusForUi(projectRaw));
}

/** Landing/picker: nháp, chưa hoạt động, đang hoạt động, đã hoàn thành. */
export function isProjectListableForUi(projectRaw = null) {
  return (
    isProjectActiveForUi(projectRaw) ||
    isProjectDraftForUi(projectRaw) ||
    isProjectReadyForPlanningForUi(projectRaw) ||
    isProjectFinishedForUi(projectRaw)
  );
}
