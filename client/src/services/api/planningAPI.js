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

  publishWbs: (projectId) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/planning/publish-wbs`),
};

export default planningAPI;
