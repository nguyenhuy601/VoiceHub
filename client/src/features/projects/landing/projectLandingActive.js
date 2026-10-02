/**
 * Landing tabs follow status. deliveryPhase wins when the stored status is stale,
 * except on_hold and closed.
 * Tab «Dự án nháp» = AI Phase 0 only (analysisMode=ai or legacy draft+RA).
 */

export const PROJECT_COMPLETED_STATUSES = Object.freeze(
  new Set(['closed', 'completed', 'archived'])
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

const PROMOTED_PHASES = Object.freeze(
  new Set(['delivery_planning', 'development', 'qa_uat', 'release_handover'])
);

function normMode(projectRaw) {
  return String(projectRaw?.analysisMode || '')
    .trim()
    .toLowerCase();
}

function normPhase(projectRaw) {
  return String(projectRaw?.deliveryPhase || '')
    .trim()
    .toLowerCase();
}

function normStatus(projectRaw) {
  return String(projectRaw?.status || '')
    .trim()
    .toLowerCase();
}

/**
 * AI Phase 0 draft for landing tab (RULE: nháp chỉ AI; legacy draft+RA|empty).
 */
export function isAiPhase0DraftProject(projectRaw = null) {
  if (!projectRaw || projectRaw.isActive === false) return false;
  const mode = normMode(projectRaw);
  const st = normStatus(projectRaw);
  const phase = normPhase(projectRaw);
  if (PROJECT_COMPLETED_STATUSES.has(st) || st === 'on_hold') return false;
  if (PROMOTED_PHASES.has(phase)) return false;
  if (['in_development', 'qa_uat', 'release_handover', 'ready'].includes(st)) return false;

  if (mode === 'manual') return false;
  if (mode === 'ai') return true;
  // Legacy (no analysisMode): status draft + RA or empty phase
  if (st === 'draft' && (phase === 'requirement_analysis' || !phase)) return true;
  return false;
}

export function landingStatusForUi(projectRaw = null) {
  const st = normStatus(projectRaw);
  if (st === 'on_hold' || PROJECT_COMPLETED_STATUSES.has(st)) return st;
  const phase = normPhase(projectRaw);
  if (STATUS_FOR_DELIVERY_PHASE[phase]) return STATUS_FOR_DELIVERY_PHASE[phase];
  // Draft / AI missing phase → draft (align with Phase 0; not development).
  if (st === 'draft' || normMode(projectRaw) === 'ai') return 'draft';
  // Phase trống (non-draft): hub ép thành development.
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

/** Tab Dự án nháp — chỉ AI Phase 0 (và legacy draft). */
export function isProjectDraftForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  return isAiPhase0DraftProject(projectRaw);
}

export function isProjectReadyForPlanningForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  if (isProjectDraftForUi(projectRaw)) return false;
  return landingStatusForUi(projectRaw) === 'ready';
}

export function isProjectActiveForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  if (isProjectFinishedForUi(projectRaw)) return false;
  if (isProjectDraftForUi(projectRaw)) return false;
  if (isProjectReadyForPlanningForUi(projectRaw)) return false;
  // Manual Phase 1 RA — list under active (not draft tab).
  const mode = normMode(projectRaw);
  const phase = normPhase(projectRaw);
  if (mode === 'manual' && (phase === 'requirement_analysis' || landingStatusForUi(projectRaw) === 'draft')) {
    return true;
  }
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
