import apiClient from './apiClient';

/**
 * Phase 1 Delivery Planning artifact APIs.
 */
export const planningAPI = {
  listArtifacts: (projectId, { kind, status } = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/planning/artifacts`, {
      params: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
      },
    }),

  getArtifact: (projectId, artifactId) =>
    apiClient.get(
      `/projects/${encodeURIComponent(projectId)}/planning/artifacts/${encodeURIComponent(artifactId)}`
    ),

  createArtifact: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/artifacts`, body),

  updateArtifact: (projectId, artifactId, body = {}) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/planning/artifacts/${encodeURIComponent(artifactId)}`,
      body
    ),

  transitionArtifact: (projectId, artifactId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/planning/artifacts/${encodeURIComponent(artifactId)}/transition`,
      body
    ),

  listBaselines: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/planning/baselines`),

  cutBaseline: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/baselines`, body),

  getSummary: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/planning/summary`),

  suggest: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/suggest`, body),

  confirmSuggestions: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/suggest/confirm`, body),

  bulkDumpArtifacts: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/artifacts/bulk`, body),

  downloadDumpTemplate: (projectId, { seedFromRa = false } = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/planning/dump-template.xlsx`, {
      responseType: 'blob',
      params: seedFromRa ? { seedFromRa: '1' } : {},
    }),

  forkArtifactVersion: (projectId, artifactId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/planning/artifacts/${encodeURIComponent(artifactId)}/fork-version`,
      body
    ),

  bulkTransitionArtifacts: (projectId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/planning/artifacts/bulk-transition`,
      body
    ),

  publishWbs: (projectId) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/publish-wbs`),
};

export default planningAPI;
