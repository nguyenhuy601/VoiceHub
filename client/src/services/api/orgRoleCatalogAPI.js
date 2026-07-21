import apiClient from './apiClient';

function withOrg(organizationId, config = {}) {
  const orgId = String(organizationId || '').trim();
  return {
    ...config,
    headers: {
      ...(config.headers || {}),
      ...(orgId ? { 'x-organization-id': orgId } : {}),
    },
    params: {
      ...(config.params || {}),
      ...(orgId ? { organizationId: orgId } : {}),
    },
  };
}

export const orgRoleCatalogAPI = {
  listCatalog: (orgId) => apiClient.get(`/organizations/${orgId}/org-roles`, withOrg(orgId)),

  createCatalog: (orgId, body) => apiClient.post(`/organizations/${orgId}/org-roles`, body, withOrg(orgId)),

  updateCatalog: (orgId, roleId, body) =>
    apiClient.patch(`/organizations/${orgId}/org-roles/${roleId}`, body, withOrg(orgId)),

  deleteCatalog: (orgId, roleId) =>
    apiClient.delete(`/organizations/${orgId}/org-roles/${roleId}`, withOrg(orgId)),

  listAssignments: (orgId, params = {}) =>
    apiClient.get(
      `/organizations/${orgId}/org-role-assignments`,
      withOrg(orgId, { params })
    ),

  setAssignments: (orgId, userId, roleKeys) =>
    apiClient.put(
      `/organizations/${orgId}/org-role-assignments`,
      { userId, roleKeys },
      withOrg(orgId)
    ),
};

