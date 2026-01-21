import apiClient from './apiClient';

export const organizationAPI = {
  // Get all organizations
  getOrganizations: async () => {
    const response = await apiClient.get('/organizations');
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
    const response = await apiClient.put(`/organizations/${orgId}/members/${userId}`, { role });
    return response;
  },

  // Remove member from organization
  removeMember: async (orgId, userId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/members/${userId}`);
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

  // Get department teams
  getTeams: async (orgId, deptId) => {
    const response = await apiClient.get(`/organizations/${orgId}/departments/${deptId}/teams`);
    return response;
  },

  // Create team
  createTeam: async (orgId, deptId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/departments/${deptId}/teams`, data);
    return response;
  },

  // Update team
  updateTeam: async (orgId, deptId, teamId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/departments/${deptId}/teams/${teamId}`, data);
    return response;
  },

  // Delete team
  deleteTeam: async (orgId, deptId, teamId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/departments/${deptId}/teams/${teamId}`);
    return response;
  },

  // Get organization statistics
  getStatistics: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/statistics`);
    return response;
  },
};
