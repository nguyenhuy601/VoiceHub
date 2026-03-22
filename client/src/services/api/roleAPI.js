import apiClient from './apiClient';

/* ========================================
   ROLEAPI.JS - ROLE & PERMISSION MANAGEMENT API
   Quản lý vai trò (roles) trong organization/server
   Liên kết với: role-permission-service (port 3015)
======================================== */

export const roleAPI = {
  /* ----- GET ROLES BY ORGANIZATION -----
     Lấy danh sách tất cả roles trong organization
     Query: GET /roles?organizationId={orgId}
     Return: [{ id, name, permissions, members, color, icon, ... }]
  */
  getRolesByOrganization: (organizationId) => {
    return apiClient.get(`/roles?organizationId=${organizationId}`);
  },

  /* ----- GET ROLES BY SERVER -----
     Lấy danh sách roles trong 1 server cụ thể
     Query: GET /servers/{serverId}/roles
     Return: [{ id, name, permissions, members, color, icon, ... }]
  */
  getRolesByServer: (serverId) => {
    return apiClient.get(`/servers/${serverId}/roles`);
  },

  /* ----- GET ROLE BY ID -----
     Lấy chi tiết 1 role
     Query: GET /roles/{roleId}
     Return: { id, name, permissions, members, color, icon, ... }
  */
  getRole: (roleId) => {
    return apiClient.get(`/roles/${roleId}`);
  },

  /* ----- CREATE ROLE -----
     Tạo vai trò mới
     POST: /roles
     Body: { name, serverId/organizationId, permissions, color, icon }
     Return: { id, name, permissions, members: 0, color, icon, ... }
  */
  createRole: (roleData) => {
    return apiClient.post('/roles', roleData);
  },

  /* ----- UPDATE ROLE -----
     Cập nhật thông tin role
     PATCH: /roles/{roleId}
     Body: { name, permissions, color, icon, ... }
     Return: { id, name, permissions, members, color, icon, ... }
  */
  updateRole: (roleId, updates) => {
    return apiClient.patch(`/roles/${roleId}`, updates);
  },

  /* ----- DELETE ROLE -----
     Xóa vai trò
     DELETE: /roles/{roleId}
     Return: { success: true }
  */
  deleteRole: (roleId) => {
    return apiClient.delete(`/roles/${roleId}`);
  },

  /* ----- ASSIGN ROLE TO USER -----
     Gán role cho user
     POST: /roles/{roleId}/assign
     Body: { userId, serverId }
     Return: { success: true, userRole: { ... } }
  */
  assignRoleToUser: (roleId, userId, serverId) => {
    return apiClient.post(`/roles/${roleId}/assign`, { userId, serverId });
  },

  /* ----- REMOVE ROLE FROM USER -----
     Gỡ role khỏi user
     DELETE: /roles/{roleId}/users/{userId}
     Return: { success: true }
  */
  removeRoleFromUser: (roleId, userId) => {
    return apiClient.delete(`/roles/${roleId}/users/${userId}`);
  },

  /* ----- GET ROLE MEMBERS -----
     Lấy danh sách members có role này
     GET: /roles/{roleId}/members
     Return: [{ id, name, email, avatar, ... }]
  */
  getRoleMembers: (roleId) => {
    return apiClient.get(`/roles/${roleId}/members`);
  }
};

export default roleAPI;
