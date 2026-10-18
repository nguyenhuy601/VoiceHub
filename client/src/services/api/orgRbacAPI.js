import apiClient from './apiClient';
import { notifyRbacGrantsChanged } from '../../utils/rbacUi';

const withOrg = (orgId) => ({ headers: { 'x-organization-id': orgId } });

async function writeThenNotify(request) {
  const res = await request;
  notifyRbacGrantsChanged();
  return res;
}

/** Org RBAC 3-layer: Permission matrix, Position↔Role bind, Position assign. */
export const orgRbacAPI = {
  getRolePermissions: (orgId, roleId) =>
    apiClient.get(`/organizations/${orgId}/org-roles/${roleId}/permissions`, withOrg(orgId)),

  putRolePermissions: (orgId, roleId, permissions) =>
    writeThenNotify(
      apiClient.put(
        `/organizations/${orgId}/org-roles/${roleId}/permissions`,
        { permissions },
        withOrg(orgId)
      )
    ),

  getPositionRoles: (orgId, positionId) =>
    apiClient.get(`/organizations/${orgId}/hr-positions/${positionId}/roles`, withOrg(orgId)),

  putPositionRoles: (orgId, positionId, roleIds) =>
    writeThenNotify(
      apiClient.put(
        `/organizations/${orgId}/hr-positions/${positionId}/roles`,
        { roleIds },
        withOrg(orgId)
      )
    ),

  listAssignments: (orgId, params = {}) =>
    apiClient.get(`/organizations/${orgId}/position-assignments`, {
      ...withOrg(orgId),
      params,
    }),

  assignPosition: (orgId, body) =>
    writeThenNotify(
      apiClient.post(`/organizations/${orgId}/position-assignments`, body, withOrg(orgId))
    ),

  endAssignment: (orgId, assignmentId) =>
    writeThenNotify(
      apiClient.post(
        `/organizations/${orgId}/position-assignments/${assignmentId}/end`,
        {},
        withOrg(orgId)
      )
    ),

  putUserOrgRoleGrants: (orgId, userId, roleIds) =>
    writeThenNotify(
      apiClient.put(
        `/organizations/${orgId}/members/${userId}/org-role-grants`,
        { roleIds },
        withOrg(orgId)
      )
    ),
};

export default orgRbacAPI;
