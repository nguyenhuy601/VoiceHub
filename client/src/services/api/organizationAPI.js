import apiClient from './apiClient';

export const organizationAPI = {
  // Get all organizations
  getOrganizations: async () => {
    const response = await apiClient.get('/organizations/my');
    return response;
  },

  // Get single organization
  getOrganization: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}`);
    return response;
  },

  // Create organization
  createOrganization: async (data) => {
    const response = await apiClient.post('/organizations', data);
    return response;
  },

  // Get pending invitations for current user
  getMyInvitations: async () => {
    const response = await apiClient.get('/organizations/invitations');
    return response;
  },

  // Respond invitation (accept/reject)
  respondInvitation: async (invitationId, action) => {
    const response = await apiClient.post(`/organizations/invitations/${invitationId}/respond`, { action });
    return response;
  },

  // Update organization
  updateOrganization: async (orgId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}`, data);
    return response;
  },

  // Delete organization
  deleteOrganization: async (orgId) => {
    const response = await apiClient.delete(`/organizations/${orgId}`);
    return response;
  },

  // Get organization members
  getMembers: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members`);
    return response;
  },

  // Add member to organization
  addMember: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/members`, data);
    return response;
  },

  // Update member role
  updateMemberRole: async (orgId, userId, role) => {
    const response = await apiClient.put(`/organizations/${orgId}/members/${userId}/role`, { role });
    return response;
  },

  // Remove member from organization
  removeMember: async (orgId, userId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/members/${userId}`);
    return response;
  },

  /** Người dùng hiện tại tự rời tổ chức */
  leaveOrganization: async (orgId) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/leave`);
    return response;
  },

  // Join organization via invite link (beta)
  joinByInviteLink: async (orgId, token) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/join-link`, { token });
    return response;
  },

  // Create invite link for organization
  createInviteLink: async (orgId) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/invite-link`);
    return response;
  },

  // Get organization departments
  getDepartments: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/departments`);
    return response;
  },

  // Create department
  createDepartment: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/departments`, data);
    return response;
  },

  // Update department
  updateDepartment: async (orgId, deptId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/departments/${deptId}`, data);
    return response;
  },

  // Delete department
  deleteDepartment: async (orgId, deptId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/departments/${deptId}`);
    return response;
  },

  // Get department channels
  getChannels: async (orgId, deptId) => {
    const response = await apiClient.get(`/organizations/${orgId}/departments/${deptId}/channels`);
    return response;
  },

  // Create channel
  createChannel: async (orgId, deptId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/departments/${deptId}/channels`, data);
    return response;
  },

  // Update channel
  updateChannel: async (orgId, deptId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/departments/${deptId}/channels/${channelId}`, data);
    return response;
  },

  // Delete channel
  deleteChannel: async (orgId, deptId, channelId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/departments/${deptId}/channels/${channelId}`);
    return response;
  },

  // Get organization statistics
  getStatistics: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/statistics`);
    return response;
  },
};

// Backward-compatible aliases while migrating callers.
organizationAPI.getTeams = organizationAPI.getChannels;
organizationAPI.createTeam = organizationAPI.createChannel;
organizationAPI.updateTeam = organizationAPI.updateChannel;
organizationAPI.deleteTeam = organizationAPI.deleteChannel;
