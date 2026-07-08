import apiClient from './api/apiClient';

/**
 * Upload WebM recording segment sau khi rời phòng voice.
 */
export async function uploadMeetingRecording(meetingId, blob, meta = {}) {
  const form = new FormData();
  form.append('recording', blob, 'recording.webm');
  form.append('durationSec', String(meta.durationSec || 0));
  const segmentIndex = meta.segmentIndex;
  const url =
    segmentIndex !== undefined && segmentIndex !== null
      ? `/meetings/${meetingId}/recording/upload?segmentIndex=${segmentIndex}`
      : `/meetings/${meetingId}/recording/upload`;
  return apiClient.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  });
}

export async function getMeetingRecording(meetingId) {
  return apiClient.get(`/meetings/${meetingId}/recording`);
}

export async function fetchMeetingRecordingStream(meetingId, segmentId = null) {
  const url = segmentId
    ? `/meetings/${meetingId}/recording/stream?segmentId=${segmentId}`
    : `/meetings/${meetingId}/recording/stream`;
  return apiClient.get(url, {
    responseType: 'blob',
    timeout: 120000,
  });
}
