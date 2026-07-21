/**
 * Client API — Project Team / Delegation Graph / Assign evaluate (task-service boards).
 */
import apiClient from './apiClient';

function boardBase(boardId) {
  return `/tasks/boards/${boardId}`;
}

export const projectDeliveryAPI = {
  listProjectRoles: (boardId) => apiClient.get(`${boardBase(boardId)}/project-roles`),
  listProjectMembers: (boardId) => apiClient.get(`${boardBase(boardId)}/project-members`),
  setMemberRoles: (boardId, memberUserId, projectRoleKeys) =>
    apiClient.put(`${boardBase(boardId)}/project-members/${memberUserId}/roles`, {
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
