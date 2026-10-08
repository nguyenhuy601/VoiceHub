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

  /** Chuẩn hóa dữ liệu khách → Customer_Requirement_Raw.xlsx (blob). */
  normalizeToCustomerRaw: (organizationId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post('/projects/requirements/import/normalize', form, {
      ...withOrg(organizationId),
      headers: { 'Content-Type': 'multipart/form-data' },
      responseType: 'blob',
      skipGlobalErrorHandling: true,
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
    const params = {};
    if (view) params.view = view;
    if (options.gateRowOffset != null && options.gateRowOffset !== '') {
      params.gateRowOffset = options.gateRowOffset;
      params.gateRowLimit = options.gateRowLimit;
    }
    return apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}`,
      withOrg(organizationId, { params })
    );
  },

  downloadSourceFile: (organizationId, packId) =>
    apiClient.get(`/projects/requirements/${encodeURIComponent(packId)}/source-file`, {
      ...withOrg(organizationId),
      responseType: 'blob',
      skipGlobalErrorHandling: true,
    }),

  submitPack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/submit`,
      body,
      withOrg(organizationId)
    ),

  approvePack: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/approve`,
      body,
      withOrg(organizationId)
    ),

  rejectPack: (organizationId, packId, reason = '', extras = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/reject`,
      {
        reason,
        ...(extras.projectId ? { projectId: String(extras.projectId) } : {}),
      },
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

  getAiAnalysis: (organizationId, packId, options = {}) => {
    const view = String(options.view || '').trim();
    const job = String(options.job || '').trim();
    // Backward-compat: callers may still pass a raw params object without view/job.
    const legacyParams =
      options && typeof options === 'object' && !view && !job && !options.params
        ? options
        : options.params;
    return apiClient.get(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis`,
      withOrg(organizationId, {
        params: {
          ...(legacyParams && typeof legacyParams === 'object' ? legacyParams : {}),
          ...(view ? { view } : {}),
          ...(job ? { job } : {}),
        },
      })
    );
  },

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

  startPhaseAiPlanning: (organizationId, packId, body = {}, options = {}) => {
    const idempotencyKey =
      options.idempotencyKey ||
      body.idempotencyKey ||
      (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `phase-run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
    const { idempotencyKey: _omit, ...restBody } = body || {};
    return apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/phase-run`,
      restBody,
      withOrg(organizationId, {
        timeout: options.timeout ?? 120000,
        headers: {
          ...(options.headers || {}),
          'Idempotency-Key': String(idempotencyKey),
        },
      })
    );
  },

  resumePhaseWhatDataGate: (organizationId, packId, { runId, decision }) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/phase-run`,
      {
        phase: 'what',
        mode: 'g4',
        action: 'resume_data_gate',
        decision,
        runId,
      },
      {
        ...withOrg(organizationId),
        timeout: 30000,
      }
    ),

  /** Gate2 — confirm phase_how (phase-only; no job id). Optional action for PM→PO lane. */
  confirmPhaseGate2: (organizationId, packId, body = {}) =>
    apiClient.post(
      `/projects/requirements/${encodeURIComponent(packId)}/ai-analysis/confirm`,
      { phase: 'how', ...body },
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
};
