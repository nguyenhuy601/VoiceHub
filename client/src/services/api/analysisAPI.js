import apiClient from './apiClient';

/**
 * Phase 1 analysis / customer docs / SRS / gate APIs.
 */
export const analysisAPI = {
  listCustomerDocuments: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/customer-documents`),

  createCustomerDocument: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/customer-documents`, body),

  listArtifacts: (projectId, { kind, status } = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/analysis-artifacts`, {
      params: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
      },
    }),

  getArtifact: (projectId, artifactId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/analysis-artifacts/${encodeURIComponent(artifactId)}`
    ),

  createArtifact: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/analysis-artifacts`, body),

  updateArtifact: (projectId, artifactId, body = {}) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/analysis-artifacts/${encodeURIComponent(artifactId)}`,
      body
    ),

  transitionArtifact: (projectId, artifactId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-artifacts/${encodeURIComponent(artifactId)}/transition`,
      body
    ),

  bulkTransitionArtifacts: (projectId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-artifacts/bulk-transition`,
      body,
      { timeout: 180000 }
    ),

  listTraceLinks: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/analysis-trace-links`),

  createTraceLink: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/analysis-trace-links`, body),

  getGaps: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/analysis-gaps`),

  getSrsDraft: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/srs-draft`),

  listSrsBaselines: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/srs-baselines`),

  cutSrsBaseline: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/srs-baselines`, body),

  startDeliveryPlanning: (projectId) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/phase1/start-planning`),

  advancePhase2: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/phase2/advance`, body),

  previewAnalysisImport: (projectId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-import/preview`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  confirmAnalysisImport: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/analysis-import/confirm`, body, {
      timeout: 120000,
    }),

  listImportSets: (projectId, { status } = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/analysis-import-sets`, {
      params: status ? { status } : undefined,
    }),

  attachRawImportSet: (projectId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-import-sets/raw`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
  },

  trashImportSet: (projectId, setId) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-import-sets/${encodeURIComponent(setId)}/trash`
    ),

  restoreImportSet: (projectId, setId) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-import-sets/${encodeURIComponent(setId)}/restore`
    ),

  getImportSetDiff: (projectId, setId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/analysis-import-sets/${encodeURIComponent(setId)}/diff`
    ),

  transitionImportSet: (projectId, setId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/analysis-import-sets/${encodeURIComponent(setId)}/transition`,
      body,
      { timeout: 180000 }
    ),
};

export default analysisAPI;
