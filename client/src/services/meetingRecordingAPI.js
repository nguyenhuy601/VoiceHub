import apiClient from './api/apiClient';

/**
 * Upload WebM recording sau khi rời phòng voice.
 * @param {string} meetingId
 * @param {Blob} blob
 * @param {{ durationSec?: number }} meta
 */
export async function uploadMeetingRecording(meetingId, blob, meta = {}) {
  const form = new FormData();
  form.append('recording', blob, 'recording.webm');
  form.append('durationSec', String(meta.durationSec || 0));
  return apiClient.post(`/meetings/${meetingId}/recording/upload`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
}

export async function getMeetingRecording(meetingId) {
  return apiClient.get(`/meetings/${meetingId}/recording`);
}

export async function fetchMeetingRecordingStream(meetingId) {
  return apiClient.get(`/meetings/${meetingId}/recording/stream`, {
    responseType: 'blob',
    timeout: 120000,
  });
}
