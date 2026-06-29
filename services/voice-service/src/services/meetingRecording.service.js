const { randomUUID } = require('crypto');
const Meeting = require('../models/Meeting');
const objectStorage = require('../utils/objectStorage');
const { publishJson } = require('../messaging/rabbit');
const { VOICE_RECORDING_PROCESS_QUEUE } = require('@enterprise/shared/messaging/voiceRecordingEvents');
const { logger } = require('@enterprise/shared');

const MIN_RECORDING_SEC = 180;

function isRecordingEnabled() {
  return String(process.env.VOICE_RECORDING_ENABLED || 'true').toLowerCase() !== 'false';
}

function maxUploadBytes() {
  const mb = Math.min(
    Math.max(parseInt(process.env.VOICE_RECORDING_MAX_UPLOAD_MB || '50', 10) || 50, 1),
    200
  );
  return mb * 1024 * 1024;
}

function opusBitrateKbps() {
  return Math.min(
    Math.max(parseInt(process.env.VOICE_RECORDING_OPUS_BITRATE_KBPS || '16', 10) || 16, 8),
    48
  );
}

function userCanAccessMeetingRecording(meeting, userId) {
  const uid = String(userId || '').trim();
  if (!meeting || !uid) return false;
  const hostId = String(meeting.hostId?._id || meeting.hostId || '');
  if (hostId === uid) return true;
  return (meeting.participants || []).some((p) => String(p.userId?._id || p.userId) === uid);
}

function resolveRoomKey(meeting) {
  if (meeting?.lobbyRoomId) return String(meeting.lobbyRoomId);
  if (meeting?.voiceChannelId) return String(meeting.voiceChannelId);
  return String(meeting?._id || meeting?.id || 'unknown');
}

function computeDurationSec(meeting) {
  if (Number.isFinite(meeting?.durationSec) && meeting.durationSec > 0) {
    return Math.floor(meeting.durationSec);
  }
  const start = meeting?.startTime ? new Date(meeting.startTime).getTime() : 0;
  const end = meeting?.endTime ? new Date(meeting.endTime).getTime() : Date.now();
  if (!start) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

function enrichMeetingRecordingFields(meeting) {
  if (!meeting) return meeting;
  const row = typeof meeting.toObject === 'function' ? meeting.toObject() : { ...meeting };
  const durationSec = computeDurationSec(row);
  const status = row.recordingStatus || 'none';
  const hasAudio = status === 'ready' && Boolean(row.audioStoragePath);
  const hasTranscript = Boolean(String(row.transcript || '').trim());
  const hasSummary = Boolean(String(row.summary || '').trim());
  const legacyRecording = Boolean(row.recordingUrl) && !row.audioStoragePath;
  const hasRecording =
    durationSec >= MIN_RECORDING_SEC &&
    (hasAudio ||
      hasTranscript ||
      legacyRecording ||
      ['pending_upload', 'processing', 'audio_expired'].includes(status));

  return {
    ...row,
    durationSec,
    hasRecording,
    hasAudio,
    hasTranscript,
    hasSummary,
    summaryPreview: String(row.summary || '').trim().slice(0, 160),
  };
}

async function assertParticipantAccess(meetingId, userId) {
  const meeting = await Meeting.findById(meetingId).lean();
  if (!meeting) {
    const err = new Error('Meeting not found');
    err.statusCode = 404;
    throw err;
  }
  if (!userCanAccessMeetingRecording(meeting, userId)) {
    const err = new Error('Forbidden');
    err.statusCode = 403;
    throw err;
  }
  return meeting;
}

async function handleUpload({ meetingId, userId, fileBuffer, mimeType, durationSec }) {
  if (!isRecordingEnabled()) {
    const err = new Error('Voice recording is disabled');
    err.statusCode = 503;
    throw err;
  }
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage is not configured');
    err.statusCode = 503;
    throw err;
  }

  const meeting = await assertParticipantAccess(meetingId, userId);
  const duration = Number(durationSec) || computeDurationSec(meeting);
  if (duration < MIN_RECORDING_SEC) {
    const err = new Error(`Recording must be at least ${MIN_RECORDING_SEC} seconds`);
    err.statusCode = 400;
    throw err;
  }

  if (!fileBuffer?.length) {
    const err = new Error('Empty recording file');
    err.statusCode = 400;
    throw err;
  }
  if (fileBuffer.length > maxUploadBytes()) {
    const err = new Error('Recording file too large');
    err.statusCode = 413;
    throw err;
  }

  const mime = String(mimeType || '').toLowerCase();
  if (!mime.startsWith('audio/') && mime !== 'video/webm') {
    const err = new Error('Invalid audio MIME type');
    err.statusCode = 400;
    throw err;
  }

  const roomKey = resolveRoomKey(meeting);
  const tempStoragePath = `temp/meeting-recordings/${meetingId}/${randomUUID()}.webm`;
  await objectStorage.putObject(tempStoragePath, fileBuffer, mime || 'audio/webm');

  await Meeting.findByIdAndUpdate(meetingId, {
    $set: {
      recordingStatus: 'processing',
      tempStoragePath,
      durationSec: duration,
      isRecording: false,
      recordingUrl: null,
    },
  });

  await publishJson(VOICE_RECORDING_PROCESS_QUEUE, {
    meetingId: String(meetingId),
    roomKey,
    tempStoragePath,
    durationSec: duration,
    opusBitrateKbps: opusBitrateKbps(),
    skipTranscript: String(process.env.VOICE_RECORDING_SKIP_TRANSCRIPT || 'false').toLowerCase() === 'true',
  });

  logger.info(`Meeting recording upload queued meeting=${meetingId} path=${tempStoragePath}`);
  return { meetingId: String(meetingId), recordingStatus: 'processing' };
}

async function getRecordingPayload(meetingId, userId) {
  const meeting = await assertParticipantAccess(meetingId, userId);
  const enriched = enrichMeetingRecordingFields(meeting);

  return {
    meetingId: String(meetingId),
    recordingStatus: enriched.recordingStatus,
    hasAudio: enriched.hasAudio,
    hasTranscript: enriched.hasTranscript,
    hasSummary: enriched.hasSummary,
    transcript: enriched.transcript || '',
    summary: enriched.summary || '',
    summaryPreview: enriched.summaryPreview || '',
    durationSec: enriched.durationSec,
  };
}

async function streamRecording(meetingId, userId) {
  const meeting = await assertParticipantAccess(meetingId, userId);
  if (meeting.recordingStatus !== 'ready' || !meeting.audioStoragePath) {
    const err = new Error('Recording audio not available');
    err.statusCode = 404;
    throw err;
  }
  return {
    stream: await objectStorage.getObjectStream(meeting.audioStoragePath),
    contentType: 'audio/opus',
  };
}

async function applyWorkerResult(meetingId, payload) {
  const update = {
    recordingStatus: payload.recordingStatus || 'ready',
    audioStoragePath: payload.audioStoragePath || null,
    transcript: payload.transcript || '',
    summary: payload.summary || '',
    tempStoragePath: null,
    durationSec: payload.durationSec ?? undefined,
  };
  if (payload.error) {
    update.recordingStatus = 'failed';
  }
  const meeting = await Meeting.findByIdAndUpdate(
    meetingId,
    { $set: update },
    { new: true }
  ).lean();
  if (payload.tempStoragePath) {
    await objectStorage.deleteObject(payload.tempStoragePath);
  }
  return meeting;
}

async function deleteMeetingStorage(meeting) {
  if (!meeting || !objectStorage.isEnabled()) return;
  const paths = [meeting.audioStoragePath, meeting.tempStoragePath].filter(Boolean);
  await objectStorage.deleteObjects(paths);
}

module.exports = {
  MIN_RECORDING_SEC,
  isRecordingEnabled,
  userCanAccessMeetingRecording,
  enrichMeetingRecordingFields,
  handleUpload,
  getRecordingPayload,
  streamRecording,
  applyWorkerResult,
  deleteMeetingStorage,
  resolveRoomKey,
  computeDurationSec,
};
