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

  createIntakeDraft: (organizationId, body = {}) =>
    apiClient.post('/projects/requirements/intake-draft', body, withOrg(organizationId)),

  listPackCustomerDocuments: (organizationId, packId) =>
    apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/customer-documents`,
      withOrg(organizationId)
    ),

  uploadPackCustomerDocument: (organizationId, packId, file, { docClass, notes } = {}) => {
    const form = new FormData();
    form.append('file', file);
    if (docClass) form.append('docClass', docClass);
    if (notes) form.append('notes', notes);
    return apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/customer-documents`,
      form,
      {
        ...withOrg(organizationId),
        headers: { 'Content-Type': 'multipart/form-data' },
      }
    );
  },

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

  startPhaseAiPlanning: (organizationId, packId, body = {}, options = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/phase-run`,
      body,
      {
        ...withOrg(organizationId),
        // Stage2 G4 remote / HOW phase-run (5m).
        timeout: options.timeout ?? 300000,
      }
    ),

  confirmAiAnalysis: (organizationId, packId, job, edits = null) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/confirm`,
      edits != null ? { job, edits } : { job },
      withOrg(organizationId)
    ),

  /** Gate2 — confirm phase_how (phase-only; no job id). */
  confirmPhaseGate2: (organizationId, packId) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/confirm`,
      { phase: 'how' },
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
};
