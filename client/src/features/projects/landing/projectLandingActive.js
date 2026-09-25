/**
 * Active / draft project predicates for Collaborate landing UI.
 * Soft-archive alone uses isActive === false (see isProjectCompletedForUi).
 */
export const PROJECT_COMPLETED_STATUSES = Object.freeze(
  new Set(['closed', 'completed', 'archived', 'cancelled', 'canceled'])
);

/** Lifecycle draft (+ legacy planning statuses mapped to draft on cards). */
export const PROJECT_DRAFT_STATUSES = Object.freeze(
  new Set(['draft', 'planning', 'ready_for_planning'])
);

export function isProjectCompletedForUi(projectRaw = null) {
  const st = String(projectRaw?.status || '').toLowerCase();
  return PROJECT_COMPLETED_STATUSES.has(st) || projectRaw?.isActive === false;
}

export function isProjectDraftForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  const st = String(projectRaw?.status || '').toLowerCase();
  if (PROJECT_COMPLETED_STATUSES.has(st)) return false;
  return PROJECT_DRAFT_STATUSES.has(st);
}

/** Active UI: non-terminal, not soft-archived, not draft. */
export function isProjectActiveForUi(projectRaw = null) {
  if (projectRaw?.isActive === false) return false;
  const st = String(projectRaw?.status || '').toLowerCase();
  if (PROJECT_COMPLETED_STATUSES.has(st)) return false;
  if (PROJECT_DRAFT_STATUSES.has(st)) return false;
  return true;
}

/** Landing/picker list: active or draft (excludes completed / soft-archive). */
export function isProjectListableForUi(projectRaw = null) {
  return isProjectActiveForUi(projectRaw) || isProjectDraftForUi(projectRaw);
}
