/**
 * Client API — Project Team / Delegation Graph / Assign evaluate.
 * Members: ưu tiên /projects/:projectId; board path vẫn dùng cho delegation/ACL.
 */
import apiClient from './apiClient';

function boardBase(boardId) {
  return `/tasks/boards/${boardId}`;
}

function projectBase(projectId) {
  return `/projects/${projectId}`;
}

export const projectDeliveryAPI = {
  listProjectRoles: (boardId) => apiClient.get(`${boardBase(boardId)}/project-roles`),
  /** @param {string} id boardId hoặc projectId — BE resolve cả hai qua listProjectMemberships */
  listProjectMembers: (id, { asProject = false } = {}) =>
    asProject
      ? apiClient.get(`${projectBase(id)}/members`)
      : apiClient.get(`${boardBase(id)}/project-members`),
  setMemberRoles: (boardId, memberUserId, projectRoleKeys) =>
    apiClient.put(`${boardBase(boardId)}/project-members/${memberUserId}/roles`, {
      projectRoleKeys,
      ...(options.otOverride ? { otOverride: true } : {}),
      ...(options.otRationale != null && String(options.otRationale).trim()
        ? { otRationale: String(options.otRationale).trim() }
        : {}),
    }),
  setProjectMemberRoles: (projectId, memberUserId, projectRoleKeys) =>
    apiClient.put(`${projectBase(projectId)}/members/${memberUserId}/roles`, {
      projectRoleKeys,
    }),
  setProjectMemberRoles: (projectId, memberUserId, projectRoleKeys) =>
    apiClient.put(`${projectBase(projectId)}/members/${memberUserId}/roles`, {
      projectRoleKeys,
    }),
  listDelegation: (boardId) => apiClient.get(`${boardBase(boardId)}/delegation`),
  upsertDelegationEdge: (boardId, body) =>
    apiClient.put(`${boardBase(boardId)}/delegation/edges`, body),
  deleteDelegationEdge: (boardId, edgeId) =>
    apiClient.delete(`${boardBase(boardId)}/delegation/edges/${edgeId}`),
  applyDelegationTemplate: (boardId, templateId = 'product') =>
    apiClient.post(`${boardBase(boardId)}/delegation/apply-template`, { templateId }),
  evaluateAssign: (boardId, { targetUserId, taskType, slot }) =>
    apiClient.post(`${boardBase(boardId)}/assign/evaluate`, {
      targetUserId,
      taskType,
      slot,
    }),
};

export default projectDeliveryAPI;
