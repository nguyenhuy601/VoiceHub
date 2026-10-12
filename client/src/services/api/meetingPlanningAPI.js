import apiClient from './apiClient';

/** MeetingPlan + MeetingEvent — /projects/:id/meetings-planning */
export const meetingPlanningAPI = {
  getPlan: (projectId) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/meetings-planning/plan`),

  seedPlan: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/meetings-planning/plan/seed`, body),

  putPlan: (projectId, body) =>
    apiClient.put(`/projects/${encodeURIComponent(projectId)}/meetings-planning/plan`, body),

  confirmPlan: (projectId) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/meetings-planning/plan/confirm`),

  previewEndDate: (projectId, body) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/meetings-planning/plan/preview-end-date`,
      body
    ),

  listEvents: (projectId, { view } = {}) =>
    apiClient.get(`/projects/${encodeURIComponent(projectId)}/meetings-planning/events`, {
      params: view ? { view } : undefined,
    }),

  createEvent: (projectId, body) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/meetings-planning/events`, body),

  patchEvent: (projectId, eventId, body) =>
    apiClient.patch(
      `/projects/${encodeURIComponent(projectId)}/meetings-planning/events/${encodeURIComponent(eventId)}`,
      body
    ),

  cancelEvent: (projectId, eventId, body) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/meetings-planning/events/${encodeURIComponent(eventId)}/cancel`,
      body
    ),

  completeEvent: (projectId, eventId, body = {}) =>
    apiClient.post(
      `/projects/${encodeURIComponent(projectId)}/meetings-planning/events/${encodeURIComponent(eventId)}/complete`,
      body
    ),

  createRecurrence: (projectId, body) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/meetings-planning/recurrence`, body),

  workload: (projectId, body = {}) =>
    apiClient.post(`/projects/${encodeURIComponent(projectId)}/meetings-planning/workload`, body),
};

/** Org Effort Estimation Configuration */
export const effortEstimationAPI = {
  getPublished: (organizationId) =>
    apiClient.get('/projects/governance/effort-estimation', {
      params: { organizationId },
    }),

  getDraft: (organizationId) =>
    apiClient.get('/projects/governance/effort-estimation/draft', {
      params: { organizationId },
    }),

  putDraft: (organizationId, body) =>
    apiClient.put('/projects/governance/effort-estimation/draft', body, {
      params: { organizationId },
    }),

  publish: (organizationId) =>
    apiClient.post(
      '/projects/governance/effort-estimation/publish',
      {},
      { params: { organizationId } }
    ),

  listVersions: (organizationId) =>
    apiClient.get('/projects/governance/effort-estimation/versions', {
      params: { organizationId },
    }),
};
