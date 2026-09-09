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

/** CRUD Project Roles catalog — `/projects/roles` (org-scoped). */
const PROJECT_ROLES_BASE = '/projects/roles';

export const projectRolesAPI = {
  listRoles: (organizationId) => apiClient.get(PROJECT_ROLES_BASE, withOrg(organizationId)),

  createRole: (organizationId, body) =>
    apiClient.post(PROJECT_ROLES_BASE, { ...body, organizationId }, withOrg(organizationId)),

  reorderRoles: (organizationId, orderedIds) =>
    apiClient.put(
      `${PROJECT_ROLES_BASE}/reorder`,
      { orderedIds, organizationId },
      withOrg(organizationId)
    ),

  updateRole: (organizationId, roleId, body) =>
    apiClient.patch(
      `${PROJECT_ROLES_BASE}/${roleId}`,
      { ...body, organizationId },
      withOrg(organizationId)
    ),

  deleteRole: (organizationId, roleId) =>
    apiClient.delete(`${PROJECT_ROLES_BASE}/${roleId}`, withOrg(organizationId)),
};
