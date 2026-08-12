import api from './api';

/**
 * AI Task Service — qua API Gateway → ai-task-service
 */
const aiTaskService = {
  /** POST /api/ai/tasks/extract */
  extract: async (body, headers = {}) => {
    return await api.post('/ai/tasks/extract', body, { headers });
  },

  /** GET /api/ai/tasks/extractions/:id */
  getExtraction: async (extractionId, headers = {}) => {
    return await api.get(`/ai/tasks/extractions/${extractionId}`, { headers });
  },

  /** POST /api/ai/tasks/confirm */
  confirm: async (body, headers = {}) => {
    return await api.post('/ai/tasks/confirm', body, { headers });
  },

  /** P2 — gợi ý tạo dự án */
  createProjectDraft: async (body, headers = {}) => {
    return await api.post('/ai/tasks/project-draft', body, { headers });
  },

  getProjectDraft: async (draftId, headers = {}) => {
    return await api.get(`/ai/tasks/project-drafts/${draftId}`, { headers });
  },

  confirmProjectDraft: async (draftId, body = {}, headers = {}) => {
    return await api.post(`/ai/tasks/project-drafts/${draftId}/confirm`, body, { headers });
  },

  /** P2.5 — gợi ý giao việc trên list team */
  suggestTeamCards: async (boardId, listId, body = {}, headers = {}) => {
    return await api.post(
      `/ai/tasks/boards/${encodeURIComponent(boardId)}/lists/${encodeURIComponent(listId)}/suggest-cards`,
      body,
      { headers }
    );
  },

  confirmTeamAssignDraft: async (draftId, body = {}, headers = {}) => {
    return await api.post(`/ai/tasks/team-assign-drafts/${draftId}/confirm`, body, { headers });
  },
};

export default aiTaskService;
