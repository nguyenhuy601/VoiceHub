/**
 * Quyết định quyền GET /api/projects/resources/planner (org-scoped).
 * Elevated = xem toàn org khi không filter department; scoped departmentId = wizard tạo project.
 */
function resolveOrgPlannerAccessDecision({
  isOrgAdmin = false,
  isResourceManager = false,
  canCreateProject = false,
  departmentId = '',
} = {}) {
  if (isOrgAdmin || isResourceManager) {
    return { allowed: true, elevated: true };
  }
  if (String(departmentId || '').trim() && canCreateProject) {
    return { allowed: true, elevated: false };
  }
  return { allowed: false, elevated: false };
}

module.exports = { resolveOrgPlannerAccessDecision };
