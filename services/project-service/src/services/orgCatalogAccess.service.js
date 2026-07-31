/**
 * Catalog org-level (workflow templates, approval policies):
 * - Org owner/admin: luôn đọc được
 * - Project member có settings:update | project:edit (hoặc creator / legacy admin): đọc khi có projectId
 * CRUD catalog vẫn chỉ org admin (caller enforce riêng).
 */
async function assertCanReadOrgCatalog({ organizationId, userId, projectId }) {
  const { fetchTaskWorkspaceScope } = require('./taskWorkspaceScope');
  const scope = await fetchTaskWorkspaceScope(userId, organizationId);
  const role = String(scope?.membershipRole || '').toLowerCase();
  if (role === 'owner' || role === 'admin') {
    return { scope, via: 'org_admin' };
  }

  const pid = String(projectId || '').trim();
  if (!pid) {
    const err = new Error(
      'Không có quyền xem catalog — cần org admin hoặc projectId với quyền settings dự án'
    );
    err.statusCode = 403;
    throw err;
  }

  const Project = require('../models/Project');
  const project = await Project.findById(pid).lean();
  if (!project || project.isActive === false) {
    const err = new Error('Project không tồn tại');
    err.statusCode = 404;
    throw err;
  }
  if (String(project.organizationId) !== String(organizationId)) {
    const err = new Error('projectId không thuộc organization');
    err.statusCode = 400;
    throw err;
  }

  const { isProjectRbacV2Enabled, hasPermission } = require('../utils/projectPermissionMatrix');
  if (isProjectRbacV2Enabled()) {
    const { resolveUserProjectPermissions } = require('./projectAccess.service');
    const resolved = await resolveUserProjectPermissions({ userId, projectId: pid });
    const can =
      hasPermission(resolved.permissions, 'settings:update') ||
      hasPermission(resolved.permissions, 'project:edit') ||
      resolved.isOrgAdmin ||
      resolved.isCreator;
    if (!can) {
      const err = new Error('Không có quyền xem catalog (cần settings:update trên dự án)');
      err.statusCode = 403;
      throw err;
    }
    return { scope, via: 'project_settings', project };
  }

  const { userCanAdminProject } = require('./project.service');
  const can = await userCanAdminProject(userId, project);
  if (!can) {
    const err = new Error('Không có quyền xem catalog trên dự án này');
    err.statusCode = 403;
    throw err;
  }
  return { scope, via: 'project_admin', project };
}

module.exports = {
  assertCanReadOrgCatalog,
};
