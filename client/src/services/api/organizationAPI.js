import apiClient from './apiClient';
import { getResolvedBearerToken } from '../../utils/tokenStorage';

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

  createWorkspace: async (data) => {
    const response = await apiClient.post('/organizations', data);
    return response;
  },

  getOrgShell: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/shell`, {
      skipPermissionDeniedToast: true,
      skipNotFoundToast: true,
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  getStructure: async (orgId, { includeInactive = false } = {}) => {
    const response = await apiClient.get(`/organizations/${orgId}/structure`, {
      skipPermissionDeniedToast: true,
      params: includeInactive ? { includeInactive: '1' } : undefined,
    });
    return response;
  },

  // Huy: Dynamic Organizational Structure API
  listStructureTemplates: async (orgId) =>
    apiClient.get(`/organizations/${orgId}/structure/templates`),
  getStructureLevels: async (orgId) =>
    apiClient.get(`/organizations/${orgId}/structure/levels`),
  putStructureLevels: async (orgId, data) =>
    apiClient.put(`/organizations/${orgId}/structure/levels`, data),
  listStructureUnits: async (orgId, { includeInactive = false } = {}) =>
    apiClient.get(`/organizations/${orgId}/structure/units`, {
      params: includeInactive ? { includeInactive: '1' } : undefined,
    }),
  createStructureUnit: async (orgId, data) =>
    apiClient.post(`/organizations/${orgId}/structure/units`, data),
  updateStructureUnit: async (orgId, unitId, data) =>
    apiClient.put(`/organizations/${orgId}/structure/units/${unitId}`, data),
  deleteStructureUnit: async (orgId, unitId) =>
    apiClient.delete(`/organizations/${orgId}/structure/units/${unitId}`),
  applyStructureTemplate: async (orgId, data) =>
    apiClient.post(`/organizations/${orgId}/structure/apply-template`, data),
  backfillStructureOu: async (orgId) =>
    apiClient.post(`/organizations/${orgId}/structure/backfill`),
  listStructureUnitMembers: async (orgId, unitId) =>
    apiClient.get(`/organizations/${orgId}/structure/units/${unitId}/members`),
  setStructureUnitMembers: async (orgId, unitId, data) =>
    apiClient.put(`/organizations/${orgId}/structure/units/${unitId}/members`, data),

  // Huy: Domain Cơ cấu tổ chức — getBranches hỗ trợ includeInactive
  getBranches: async (orgId, { includeInactive = false } = {}) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/branches`, {
      params: includeInactive ? { includeInactive: '1' } : undefined,
    });
    return response;
  },

  createBranch: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/branches`, data);
    return response;
  },

  // Huy: PUT chi nhánh — sửa / vô hiệu hóa
  updateBranch: async (orgId, branchId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/branches/${branchId}`, data);
    return response;
  },

  getDivisions: async (orgId, branchId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/branches/${branchId}/divisions`);
    return response;
  },

  createDivision: async (orgId, branchId, data) => {
    if (branchId) {
      return apiClient.post(`/organizations/${orgId}/hierarchy/branches/${branchId}/divisions`, data);
    }
    return apiClient.post(`/organizations/${orgId}/hierarchy/divisions`, data);
  },
  updateDivision: async (orgId, divisionId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/divisions/${divisionId}`, data);
    return response;
  },

  getDepartmentsByDivision: async (orgId, divisionId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/divisions/${divisionId}/departments`);
    return response;
  },

  createDepartmentByDivision: async (orgId, divisionId, data) => {
    if (divisionId) {
      return apiClient.post(`/organizations/${orgId}/hierarchy/divisions/${divisionId}/departments`, data);
    }
    return apiClient.post(`/organizations/${orgId}/hierarchy/departments`, data);
  },

  getTeamsByDepartment: async (orgId, deptId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/departments/${deptId}/teams`);
    return response;
  },

  createTeamByDepartment: async (orgId, deptId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/departments/${deptId}/teams`, data);
    return response;
  },
  createTeamByDivision: async (orgId, divisionId, data) =>
    apiClient.post(`/organizations/${orgId}/hierarchy/divisions/${divisionId}/teams`, data),
  createTeamRoot: async (orgId, data) =>
    apiClient.post(`/organizations/${orgId}/hierarchy/teams`, data),
  updateTeamByHierarchy: async (orgId, teamId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/teams/${teamId}`, data);
    return response;
  },

  getChannelsByTeam: async (orgId, teamId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels`);
    return response;
  },

  createChannelByTeam: async (orgId, teamId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels`, data);
    return response;
  },
  createChannelByScope: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/hierarchy/channels`, data);
    return response;
  },
  updateChannelByTeam: async (orgId, teamId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/teams/${teamId}/channels/${channelId}`, data);
    return response;
  },
  updateChannelByScope: async (orgId, channelId, data) => {
    const response = await apiClient.put(`/organizations/${orgId}/hierarchy/channels/${channelId}`, data);
    return response;
  },
  deleteChannelByScope: async (orgId, channelId) => {
    const response = await apiClient.delete(`/organizations/${orgId}/hierarchy/channels/${channelId}`);
    return response;
  },

  getWorkspaceBySlug: async (slug) => {
    const response = await apiClient.get(`/organizations/by-slug/${encodeURIComponent(slug)}`);
    return response;
  },
  getAccessibleChannelIds: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/accessible-channel-ids`, {
      skipPermissionDeniedToast: true,
    });
    return response;
  },

  getTaskWorkspaceScope: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/task-workspace-scope`, {
      skipPermissionDeniedToast: true,
    });
    return response;
  },
  listChannelAccess: async (orgId, channelId) => {
    const response = await apiClient.get(`/organizations/${orgId}/channels/${channelId}/access`);
    return response;
  },
  grantChannelAccess: async (orgId, channelId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/channels/${channelId}/access/grant`, data);
    return response;
  },
  revokeChannelAccess: async (orgId, channelId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/channels/${channelId}/access/revoke`, data);
    return response;
  },
  listChannelRoleAccess: async (orgId, channelId) => {
    const response = await apiClient.get(
      `/organizations/${orgId}/channels/${channelId}/role-access`
    );
    return response;
  },
  saveChannelRoleAccess: async (orgId, channelId, data) => {
    const response = await apiClient.put(
      `/organizations/${orgId}/channels/${channelId}/role-access`,
      data
    );
    return response;
  },
  listDivisionRoleAccess: async (orgId, divisionId) => {
    const response = await apiClient.get(
      `/organizations/${orgId}/divisions/${divisionId}/role-access`
    );
    return response;
  },
  saveDivisionRoleAccess: async (orgId, divisionId, data) => {
    const response = await apiClient.put(
      `/organizations/${orgId}/divisions/${divisionId}/role-access`,
      data
    );
    return response;
  },
  listDepartmentRoleAccess: async (orgId, departmentId) => {
    const response = await apiClient.get(
      `/organizations/${orgId}/departments/${departmentId}/role-access`
    );
    return response;
  },
  saveDepartmentRoleAccess: async (orgId, departmentId, data) => {
    const response = await apiClient.put(
      `/organizations/${orgId}/departments/${departmentId}/role-access`,
      data
    );
    return response;
  },
  listTeamRoleAccess: async (orgId, teamId, config) => {
    const response = await apiClient.get(
      `/organizations/${orgId}/hierarchy/teams/${teamId}/role-access`,
      config
    );
    return response;
  },
  saveTeamRoleAccess: async (orgId, teamId, data, config) => {
    const response = await apiClient.put(
      `/organizations/${orgId}/hierarchy/teams/${teamId}/role-access`,
      data,
      config
    );
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

  getProjectVisibilityPolicy: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/project-visibility-policy`);
    return response;
  },

  putProjectVisibilityPolicy: async (orgId, policy) => {
    const response = await apiClient.put(`/organizations/${orgId}/project-visibility-policy`, {
      policy,
    });
    return response;
  },

  getMasterData: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/master-data`);
    return response;
  },

  patchMasterDataEnabled: async (orgId, masterDataPatch) => {
    const response = await apiClient.patch(`/organizations/${orgId}/master-data/enabled`, masterDataPatch);
    return response;
  },

  // Delete organization
  deleteOrganization: async (orgId) => {
    const response = await apiClient.delete(`/organizations/${orgId}`);
    return response;
  },

  getDocumentsOverview: async (orgId) => {
    if (!getResolvedBearerToken()) {
      const err = new Error('Chưa có phiên đăng nhập (JWT). Vui lòng đăng nhập lại.');
      err.status = 401;
      err.code = 'CLIENT_NO_JWT';
      throw err;
    }
    const response = await apiClient.get(`/organizations/${orgId}/documents-overview`, {
      skipPermissionDeniedToast: true,
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  // Get organization members
  getMembers: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members`, {
      skipPermissionDeniedToast: true,
    });
    return response;
  },

  getMembersWithRoles: async (orgId, params = {}) => {
    const departmentId = String(params.departmentId || '').trim();
    const response = await apiClient.get(`/organizations/${orgId}/members/with-roles`, {
      skipPermissionDeniedToast: true,
      skipGlobalErrorHandling: true,
      params: departmentId ? { departmentId } : undefined,
    });
    return response;
  },

  // Add member to organization
  addMember: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/members`, data);
    return response;
  },

  /** HR mời nhân viên bằng email — gửi mail, user accept để provision */
  inviteMemberByEmail: async (orgId, data) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/invite`, data, {
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** Xem trước mã NV hệ thống sẽ cấp (không trừ counter). */
  previewNextEmployeeCode: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members/next-employee-code`, {
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** HR import nhân sự qua Excel (.xlsx) — strict rejection + compensate (legacy one-shot) */
  importMembersExcel: async (orgId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/organizations/${orgId}/members/import`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** Preview Excel — validate only, chưa ghi user */
  previewMembersExcel: async (orgId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await apiClient.post(`/organizations/${orgId}/members/import/preview`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** Confirm batch preview → provision (chunk + concurrency) */
  confirmMembersExcel: async (orgId, batchId) => {
    const response = await apiClient.post(
      `/organizations/${orgId}/members/import/confirm`,
      { batchId },
      { skipGlobalErrorHandling: true }
    );
    return response;
  },

  /** Lấy trạng thái batch import Excel */
  getImportBatchStatus: async (orgId, batchId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members/import/${batchId}`, {
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** Download template Excel import */
  downloadImportTemplate: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/members/import/template`, {
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    });
    return response;
  },

  /** Public — nhân viên xác nhận lời mời → tạo tài khoản */
  acceptCompanyInvite: async (token) => {
    const response = await apiClient.post(
      '/organizations/company-invites/accept',
      { token },
      { skipGlobalErrorHandling: true }
    );
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
  createInviteLink: async (orgId, data = {}) => {
    const response = await apiClient.post(`/organizations/${orgId}/members/invite-link`, data);
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

  // HR Positions (job titles) catalog — dùng để tạo mà không cần gán cho nhân viên ngay
  listHrPositions: async (orgId) => {
    const response = await apiClient.get(`/organizations/${orgId}/hr-positions`);
    return response;
  },

  createHrPosition: async (orgId, { title } = {}) => {
    const response = await apiClient.post(`/organizations/${orgId}/hr-positions`, { title });
    return response;
  },
};

// Backward-compatible aliases while migrating callers.
organizationAPI.getTeams = organizationAPI.getChannels;
organizationAPI.createTeam = organizationAPI.createChannel;
organizationAPI.updateTeam = organizationAPI.updateChannel;
organizationAPI.deleteTeam = organizationAPI.deleteChannel;
