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
    apiClient.get(`/users/${userId}`, withOrg(organizationId)),

  patchProfile: (organizationId, userId, body) =>
    apiClient.patch(`/users/${userId}`, { ...body, organizationId }, withOrg(organizationId)),

  /** C1 — HR verify hồ sơ năng lực */
  verifyCapability: (organizationId, userId) =>
    apiClient.patch(
      `/users/${userId}`,
      { organizationId, capabilityAction: 'verify' },
      withOrg(organizationId)
    ),

  confirmExperience: (organizationId, userId, evidenceBoardId) =>
    apiClient.patch(
      `/users/${userId}`,
      { organizationId, capabilityAction: 'confirm_experience', evidenceBoardId },
      withOrg(organizationId)
    ),

  /** C1 — HR reject hồ sơ năng lực */
  rejectCapability: (organizationId, userId, rejectReason) =>
    apiClient.patch(
      `/users/${userId}`,
      { organizationId, capabilityAction: 'reject', rejectReason },
      withOrg(organizationId)
    ),

  /** Capacity — HR verify maxConcurrentProjects */
  verifyResourceConfig: (organizationId, userId) =>
    apiClient.patch(
      `/users/${userId}`,
      { organizationId, resourceConfigAction: 'verify' },
      withOrg(organizationId)
    ),

  /** Capacity — HR reject maxConcurrentProjects */
  rejectResourceConfig: (organizationId, userId, rejectReason) =>
    apiClient.patch(
      `/users/${userId}`,
      { organizationId, resourceConfigAction: 'reject', rejectReason },
      withOrg(organizationId)
    ),

  getAuthSummary: (organizationId, userId) =>
    apiClient.get(`/auth/users/${userId}/summary`, withOrg(organizationId)),

  setLocked: (organizationId, userId, locked) =>
    apiClient.post(
      `/auth/users/${userId}/lock`,
      { locked, organizationId },
      withOrg(organizationId)
    ),

  forcePasswordChange: (organizationId, userId, mustChangePassword = true) =>
    apiClient.post(
      `/auth/users/${userId}/force-password`,
      { mustChangePassword, organizationId },
      withOrg(organizationId)
    ),

  triggerPasswordReset: (organizationId, userId, frontendUrl) =>
    apiClient.post(
      `/auth/users/${userId}/reset-password`,
      { organizationId, frontendUrl: frontendUrl || window.location.origin },
      withOrg(organizationId)
    ),

  getLoginEvents: (organizationId, userId, params = {}) =>
    apiClient.get(`/auth/users/${userId}/login-events`, withOrg(organizationId, { params })),

  revokeSessions: (organizationId, userId) =>
    apiClient.post(
      `/auth/users/${userId}/revoke-sessions`,
      { organizationId },
      withOrg(organizationId)
    ),

  setPassword: (organizationId, userId, { password, mustChangePassword }) =>
    apiClient.post(
      `/auth/users/${userId}/set-password`,
      { organizationId, password, mustChangePassword },
      withOrg(organizationId)
    ),

  activatePending: (organizationId, userId, { mustChangePassword = true } = {}) =>
    apiClient.post(
      `/auth/users/${userId}/activate`,
      { organizationId, mustChangePassword },
      withOrg(organizationId)
    ),

  resendVerification: (organizationId, userId, frontendUrl) =>
    apiClient.post(
      `/auth/users/${userId}/resend-verification`,
      { organizationId, frontendUrl: frontendUrl || window.location.origin },
      withOrg(organizationId)
    ),
};

export default adminUserAPI;
