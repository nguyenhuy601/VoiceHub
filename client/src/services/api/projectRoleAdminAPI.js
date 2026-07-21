import apiClient from './apiClient';

function withOrg(organizationId, config = {}) {
  const orgId = String(organizationId || '').trim();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
  };
}

export const projectRoleAdminAPI = {
  listRoles: (organizationId) =>
    apiClient.get('/tasks/admin/project-roles', withOrg(organizationId)),

  createRole: (organizationId, body) =>
    apiClient.post('/tasks/admin/project-roles', body, withOrg(organizationId)),

  updateRole: (organizationId, roleId, body) =>
    apiClient.patch(`/tasks/admin/project-roles/${roleId}`, body, withOrg(organizationId)),

  deleteRole: (organizationId, roleId) =>
    apiClient.delete(`/tasks/admin/project-roles/${roleId}`, withOrg(organizationId)),
};

