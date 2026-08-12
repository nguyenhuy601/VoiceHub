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

  startMeeting: (meetingId) => apiClient.post(`/meetings/${meetingId}/start`),

  endMeeting: (meetingId) => apiClient.post(`/meetings/${meetingId}/end`),

  /** Self-leave or kick (when actor ≠ userId and has manage rights). */
  removeParticipant: (meetingId, userId) =>
    apiClient.delete(`/meetings/${meetingId}/participants/${encodeURIComponent(userId)}`),

  muteParticipant: (meetingId, userId, muted = true) =>
    apiClient.post(`/meetings/${meetingId}/participants/${encodeURIComponent(userId)}/mute`, {
      muted: Boolean(muted),
    }),
};

export default meetingAPI;
