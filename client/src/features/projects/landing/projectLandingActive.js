/**
 * Active project for Collaborate landing UI.
 * Matches prior ProjectsLandingGrid definition (not soft-archive alone).
 */
export const PROJECT_COMPLETED_STATUSES = Object.freeze(
  new Set(['closed', 'completed', 'archived'])
);

export function isProjectCompletedForUi(projectRaw = null) {
  const st = String(projectRaw?.status || '').toLowerCase();
  return PROJECT_COMPLETED_STATUSES.has(st) || projectRaw?.isActive === false;
}

export function isProjectActiveForUi(projectRaw = null) {
  const st = String(projectRaw?.status || '').toLowerCase();
  return projectRaw?.isActive !== false && !PROJECT_COMPLETED_STATUSES.has(st);
}
