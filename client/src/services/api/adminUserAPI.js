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

export const adminUserAPI = {
  getProfile: (organizationId, userId) =>
    apiClient.get(`/users/admin/${userId}`, withOrg(organizationId)),

  patchProfile: (organizationId, userId, body) =>
    apiClient.patch(`/users/admin/${userId}`, { ...body, organizationId }, withOrg(organizationId)),

  getAuthSummary: (organizationId, userId) =>
    apiClient.get(`/auth/admin/users/${userId}/summary`, withOrg(organizationId)),

  setLocked: (organizationId, userId, locked) =>
    apiClient.post(
      `/auth/admin/users/${userId}/lock`,
      { locked, organizationId },
      withOrg(organizationId)
    ),

  forcePasswordChange: (organizationId, userId, mustChangePassword = true) =>
    apiClient.post(
      `/auth/admin/users/${userId}/force-password`,
      { mustChangePassword, organizationId },
      withOrg(organizationId)
    ),

  triggerPasswordReset: (organizationId, userId, frontendUrl) =>
    apiClient.post(
      `/auth/admin/users/${userId}/reset-password`,
      { organizationId, frontendUrl: frontendUrl || window.location.origin },
      withOrg(organizationId)
    ),

  getLoginEvents: (organizationId, userId, params = {}) =>
    apiClient.get(`/auth/admin/users/${userId}/login-events`, withOrg(organizationId, { params })),

  revokeSessions: (organizationId, userId) =>
    apiClient.post(
      `/auth/admin/users/${userId}/revoke-sessions`,
      { organizationId },
      withOrg(organizationId)
    ),

  setPassword: (organizationId, userId, { password, mustChangePassword }) =>
    apiClient.post(
      `/auth/admin/users/${userId}/set-password`,
      { organizationId, password, mustChangePassword },
      withOrg(organizationId)
    ),

  resendVerification: (organizationId, userId, frontendUrl) =>
    apiClient.post(
      `/auth/admin/users/${userId}/resend-verification`,
      { organizationId, frontendUrl: frontendUrl || window.location.origin },
      withOrg(organizationId)
    ),
};

export default adminUserAPI;
