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

export const requirementAPI = {
  downloadTemplate: async (organizationId) => {
    // apiClient interceptor already returns response.data (Blob when responseType: 'blob')
    return apiClient.get('/projects/requirements/import/template', {
      ...withOrg(organizationId),
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    });
  },

  previewImport: (organizationId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post('/projects/requirements/import/preview', form, {
      ...withOrg(organizationId),
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  confirmImport: (organizationId, sessionId) =>
    apiClient.post(
      '/projects/requirements/import/confirm',
      { sessionId },
      withOrg(organizationId)
    ),

  listPacks: (organizationId, params = {}) =>
    apiClient.get('/projects/requirements', withOrg(organizationId, { params })),

  getAccess: (organizationId) =>
    apiClient.get('/projects/requirements/access', withOrg(organizationId)),

  getPack: (organizationId, packId) =>
    apiClient.get(`/projects/requirements/${encodeURIComponent(packId)}`, withOrg(organizationId)),

  downloadSourceFile: (organizationId, packId) =>
    apiClient.get(`/projects/requirements/${encodeURIComponent(packId)}/source-file`, {
      ...withOrg(organizationId),
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    }),

  submitPack: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/submit`,
      {},
      withOrg(organizationId)
    ),

  approvePack: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/approve`,
      {},
      withOrg(organizationId)
    ),

  rejectPack: (organizationId, packId, reason = '') =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/reject`,
      { reason },
      withOrg(organizationId)
    ),

  createProjectFromPack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/create-project`,
      body,
      withOrg(organizationId)
    ),

  runAiPlanning: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-planning/run`,
      {},
      withOrg(organizationId)
    ),
};
