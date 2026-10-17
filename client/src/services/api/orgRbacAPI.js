import apiClient from './apiClient';

const withOrg = (orgId) => ({ headers: { 'x-organization-id': orgId } });

/** Org RBAC 3-layer: Permission matrix, Position↔Role bind, Position assign. */
export const orgRbacAPI = {
  getRolePermissions: (orgId, roleId) =>
    apiClient.get(`/organizations/${orgId}/org-roles/${roleId}/permissions`, withOrg(orgId)),

  putRolePermissions: (orgId, roleId, permissions) =>
    apiClient.put(
      `/organizations/${orgId}/org-roles/${roleId}/permissions`,
      { permissions },
      withOrg(orgId)
    ),

  getPositionRoles: (orgId, positionId) =>
    apiClient.get(`/organizations/${orgId}/hr-positions/${positionId}/roles`, withOrg(orgId)),

  putPositionRoles: (orgId, positionId, roleIds) =>
    apiClient.put(
      `/organizations/${orgId}/hr-positions/${positionId}/roles`,
      { roleIds },
      withOrg(orgId)
    ),

  listAssignments: (orgId, params = {}) =>
    apiClient.get(`/organizations/${orgId}/position-assignments`, {
      ...withOrg(orgId),
      params,
    }),

  assignPosition: (orgId, body) =>
    apiClient.post(`/organizations/${orgId}/position-assignments`, body, withOrg(orgId)),

  endAssignment: (orgId, assignmentId) =>
    apiClient.post(
      `/organizations/${orgId}/position-assignments/${assignmentId}/end`,
      {},
      withOrg(orgId)
    ),
};

export default orgRbacAPI;
