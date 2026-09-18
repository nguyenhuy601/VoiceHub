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
  downloadTemplate: async (organizationId, options = {}) => {
    const variant = String(options.variant || '').trim();
    // apiClient interceptor already returns response.data (Blob when responseType: 'blob')
    return apiClient.get('/projects/requirements/import/template', {
      ...withOrg(organizationId, {
        params: variant ? { variant } : {},
      }),
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

  getPack: (organizationId, packId, options = {}) => {
    const view = String(options.view || '').trim();
    return apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}`,
      withOrg(organizationId, {
        params: view ? { view } : {},
      })
    );
  },

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

  approvePack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/approve`,
      body,
      withOrg(organizationId)
    ),

  rejectPack: (organizationId, packId, reason = '') =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/reject`,
      { reason },
      withOrg(organizationId)
    ),

  deletePack: (organizationId, packId) =>
    apiClient.delete(
      `/projects/requirements/${encodeURIComponent(String(packId || '').trim())}`,
      {
        ...withOrg(organizationId),
        skipNotFoundToast: true,
      }
    ),

  createProjectFromPack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/create-project`,
      body,
      {
        ...withOrg(organizationId),
        timeout: 300000,
      }
    ),

  getAiAnalysis: (organizationId, packId, params = {}) =>
    apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis`,
      withOrg(organizationId, { params })
    ),

  createAiAnalysisSnapshot: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/snapshot`,
      body,
      {
        ...withOrg(organizationId),
        timeout: 120000,
      }
    ),

  getAiAnalysisSnapshot: (organizationId, packId) =>
    apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/snapshot`,
      withOrg(organizationId)
    ),

  runAiAnalysis: (organizationId, packId, job, options = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/run`,
      { job, ...(options.force ? { force: true } : {}) },
      {
        ...withOrg(organizationId),
        timeout: options.timeout ?? 300000,
      }
    ),

  confirmAiAnalysis: (organizationId, packId, job, edits = null) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/confirm`,
      edits != null ? { job, edits } : { job },
      withOrg(organizationId)
    ),

  exportAiAnalysisSheet11: (organizationId, packId) =>
    apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/export-sheet11`,
      {
        ...withOrg(organizationId),
        responseType: 'blob',
        skipGlobalErrorHandling: true,
      }
    ),

  getAiAnalysis: (organizationId, packId, options = {}) => {
    const view = String(options.view || '').trim();
    const job = String(options.job || '').trim();
    return apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis`,
      withOrg(organizationId, {
        params: {
          ...(view ? { view } : {}),
          ...(job ? { job } : {}),
        },
      })
    );
  },

  runAiAnalysisJob: (organizationId, packId, jobId, options = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/jobs/${encodeURIComponent(jobId)}/run`,
      { force: Boolean(options.force) },
      {
        ...withOrg(organizationId),
        timeout: options.timeout ?? 300000,
      }
    ),

  confirmAiAnalysisJob: (organizationId, packId, jobId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/jobs/${encodeURIComponent(jobId)}/confirm`,
      {},
      withOrg(organizationId)
    ),

  exportAiAnalysisSheet11: (organizationId, packId) =>
    apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/export`,
      {
        ...withOrg(organizationId),
        responseType: 'blob',
        skipGlobalErrorHandling: true,
      }
    ),
};
