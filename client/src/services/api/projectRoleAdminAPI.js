import apiClient from './apiClient';

function withOrg(organizationId, config = {}) {
  const orgId = String(organizationId || '').trim();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
    // Gateway strip x-organization-id từ client — truyền query/body để service đọc được.
    params: {
      ...(config.params || {}),
      ...(orgId ? { organizationId: orgId } : {}),
    },
  };
}

/** Admin CRUD Project Roles — canonical `/projects/admin/roles` (legacy `/tasks/admin/project-roles`). */
const ADMIN_ROLES_BASE = '/projects/admin/roles';

export const projectRoleAdminAPI = {
  listRoles: (organizationId) => apiClient.get(ADMIN_ROLES_BASE, withOrg(organizationId)),

  createRole: (organizationId, body) =>
    apiClient.post(ADMIN_ROLES_BASE, { ...body, organizationId }, withOrg(organizationId)),

  reorderRoles: (organizationId, orderedIds) =>
    apiClient.put(
      `${ADMIN_ROLES_BASE}/reorder`,
      { orderedIds, organizationId },
      withOrg(organizationId)
    ),

  updateRole: (organizationId, roleId, body) =>
    apiClient.patch(
      `${ADMIN_ROLES_BASE}/${roleId}`,
      { ...body, organizationId },
      withOrg(organizationId)
    ),

  deleteRole: (organizationId, roleId) =>
    apiClient.delete(`${ADMIN_ROLES_BASE}/${roleId}`, withOrg(organizationId)),
};
