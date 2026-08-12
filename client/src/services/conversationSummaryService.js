import api from './api';

const conversationSummaryService = {
  /** POST /api/ai/summaries */
  create: async (body, headers = {}) => {
    return await api.post('/ai/summaries', body, { headers });
  },

  /** GET /api/ai/summaries/:id */
  getById: async (summaryId, headers = {}) => {
    return await api.get(`/ai/summaries/${encodeURIComponent(String(summaryId))}`, { headers });
  },

  /** GET /api/ai/summaries/latest */
  getLatest: async (params, headers = {}) => {
    return await api.get('/ai/summaries/latest', { params, headers });
  },
};

export default conversationSummaryService;
