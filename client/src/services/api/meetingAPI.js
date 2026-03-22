import apiClient from './apiClient';

function buildQueryParams(filters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v != null && v !== '') params.set(k, String(v));
  });
  return params;
}

export const meetingAPI = {
  /** Calendar: startFrom + startTo (ISO) bắt buộc cùng lúc — lọc meeting của user trong khoảng */
  getMeetings: (filters = {}) => {
    const params = buildQueryParams(filters);
    const q = params.toString();
    return apiClient.get(q ? `/meetings?${q}` : '/meetings');
  },

  createMeeting: (data) => apiClient.post('/meetings', data),

  getMeetingById: (meetingId) => apiClient.get(`/meetings/${meetingId}`),
};
