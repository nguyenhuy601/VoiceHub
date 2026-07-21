const { randomUUID } = require('crypto');
const Meeting = require('../models/Meeting');
const objectStorage = require('../utils/objectStorage');
const { publishJson } = require('../messaging/rabbit');
const { VOICE_RECORDING_PROCESS_QUEUE } = require('@enterprise/shared/messaging/voiceRecordingEvents');
const meetingRecordingSegmentService = require('./meetingRecordingSegment.service');
const { segmentMeetsMinDuration, MIN_RECORDING_SEC } = require('../utils/meetingPersistPolicy');
const { logger } = require('@enterprise/shared');

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

async function loadSegmentsForMeeting(meetingId, meeting) {
  let segments = await meetingRecordingSegmentService.listSegments(meetingId);
  if (!segments.length && meeting?.audioStoragePath) {
    const migrated = await meetingRecordingSegmentService.migrateLegacyAudioToSegment(meeting);
    if (migrated) segments = [migrated];
  }
  return segments;
}

function enrichMeetingRecordingFields(meeting, segments = []) {
  if (!meeting) return meeting;
  const row = typeof meeting.toObject === 'function' ? meeting.toObject() : { ...meeting };
  const durationSec = computeDurationSec(row);
  const status = row.recordingStatus || 'none';
  const segmentHasAudio = segments.some((s) => s.hasAudio || s.status === 'ready');
  const segmentProcessing = segments.some((s) => s.status === 'processing');
  const hasAudio =
    segmentHasAudio || (status === 'ready' && Boolean(row.audioStoragePath));
  let recordingStatus = status;
  if (recordingStatus === 'none' && segmentProcessing) recordingStatus = 'processing';
  if (recordingStatus === 'none' && segmentHasAudio) recordingStatus = 'ready';
  const hasTranscript = Boolean(String(row.transcript || '').trim());
  const hasSummary =
    Boolean(String(row.summary || '').trim()) ||
    row.summaryStatus === 'ready' ||
    Boolean(row.summaryStructured?.summary);
  const legacyRecording = Boolean(row.recordingUrl) && !row.audioStoragePath && !segments.length;
  const hasRecording =
    segments.length > 0 ||
    hasAudio ||
    hasTranscript ||
    hasSummary ||
    legacyRecording ||
    ['pending_upload', 'processing', 'audio_expired'].includes(recordingStatus);

  return {
    ...row,
    durationSec,
    hasRecording,
    hasAudio,
    hasTranscript,
    hasSummary,
    recordingStatus,
    summaryPreview: String(row.summary || row.summaryStructured?.summary || '')
      .trim()
      .slice(0, 160),
    transcriptSource: row.transcriptSource || 'none',
    summaryStatus: row.summaryStatus || 'none',
    aiSummaryEnabled: Boolean(row.aiSummaryEnabled),
    segments,
  };
}

async function assertParticipantAccess(meetingId, userId, actor = null) {
  const meeting = await Meeting.findById(meetingId).lean();
  if (!meeting) {
    const err = new Error('Meeting not found');
    err.statusCode = 404;
    throw err;
  }
  if (userCanAccessMeetingRecording(meeting, userId)) {
    return meeting;
  }
  const { isOrgMeetingAdmin } = require('../clients/orgMembership.client');
  if (await isOrgMeetingAdmin(actor || { id: userId }, meeting)) {
    return meeting;
  }
  const err = new Error('Forbidden');
  err.statusCode = 403;
  throw err;
}

async function handleUpload({ meetingId, userId, fileBuffer, mimeType, durationSec, segmentIndex = null }) {
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
  if (!segmentMeetsMinDuration(duration)) {
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
  const skipTranscript = meeting.transcriptSource === 'realtime';
  const idx =
    segmentIndex !== null && segmentIndex !== undefined
      ? Number(segmentIndex)
      : await meetingRecordingSegmentService.getNextSegmentIndex(meetingId);

  if (Number.isFinite(idx) && idx >= 0) {
    return meetingRecordingSegmentService.handleClientSegmentUpload({
      meetingId,
      userId,
      segmentIndex: idx,
      fileBuffer,
      mimeType: mime,
      durationSec: duration,
      roomKey,
      skipTranscript,
    });
  }

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
    jobType: 'legacy_full',
    meetingId: String(meetingId),
    roomKey,
    tempStoragePath,
    durationSec: duration,
    opusBitrateKbps: opusBitrateKbps(),
    skipTranscript,
  });

  logger.info(`Meeting recording upload queued meeting=${meetingId} path=${tempStoragePath}`);
  return { meetingId: String(meetingId), recordingStatus: 'processing' };
}

async function getRecordingPayload(meetingId, userId, actor = null) {
  const meeting = await assertParticipantAccess(meetingId, userId, actor || { id: userId });
  const segments = await loadSegmentsForMeeting(meetingId, meeting);
  const enriched = enrichMeetingRecordingFields(meeting, segments);

  return {
    meetingId: String(meetingId),
    recordingStatus: enriched.recordingStatus,
    hasAudio: enriched.hasAudio,
    hasTranscript: enriched.hasTranscript,
    hasSummary: enriched.hasSummary,
    transcript: enriched.transcript || '',
    summary: enriched.summary || '',
    summaryStructured: enriched.summaryStructured || null,
    summaryPreview: enriched.summaryPreview || '',
    summaryStatus: enriched.summaryStatus,
    transcriptSource: enriched.transcriptSource,
    aiSummaryEnabled: enriched.aiSummaryEnabled,
    durationSec: enriched.durationSec,
    segments,
  };
}

async function streamRecording(meetingId, userId, segmentId = null, actor = null) {
  const meeting = await assertParticipantAccess(meetingId, userId, actor || { id: userId });

  if (segmentId) {
    return meetingRecordingSegmentService.streamSegment(segmentId, meetingId);
  }

  const segments = await loadSegmentsForMeeting(meetingId, meeting);
  if (segments.length === 1 && segments[0].id) {
    return meetingRecordingSegmentService.streamSegment(segments[0].id, meetingId);
  }

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
  if (payload.segmentId) {
    return meetingRecordingSegmentService.applySegmentWorkerResult(payload.segmentId, payload);
  }

  const update = {
    recordingStatus: payload.recordingStatus || 'ready',
    audioStoragePath: payload.audioStoragePath || null,
    transcript: payload.transcript || undefined,
    summary: payload.summary || undefined,
    tempStoragePath: null,
    durationSec: payload.durationSec ?? undefined,
  };
  if (payload.transcript && !payload.skipTranscriptMerge) {
    update.transcriptSource = payload.transcriptSource || 'post_audio';
  }
  if (payload.error) {
    update.recordingStatus = 'failed';
  }
  const meeting = await Meeting.findByIdAndUpdate(
    meetingId,
    { $set: update },
    { new: true }
  ).lean();
  // Dùng status đã apply (sau error override), không tin payload.recordingStatus đơn độc.
  if (payload.tempStoragePath && update.recordingStatus === 'ready') {
    await objectStorage.deleteObject(payload.tempStoragePath);
  }
  return meeting;
}

async function applyTranscriptChunk(meetingId, payload) {
  const meetingAiSummary = require('./meetingAiSummary.service');
  const voiceBroadcast = require('../socket/voiceBroadcast');
  const result = await meetingAiSummary.appendTranscriptChunk(meetingId, payload);
  if (!result) return null;

  const meeting = await Meeting.findById(meetingId).lean();
  const roomId = meeting?.lobbyRoomId || meeting?.voiceChannelId;
  if (roomId) {
    voiceBroadcast.broadcastTranscriptPartial(String(roomId), {
      meetingId: String(meetingId),
      seq: result.seq,
      text: result.text,
      speakerId: payload.speakerId || '',
      displayName: payload.displayName || '',
    });
  }
  return result;
}

async function applySummaryResult(meetingId, payload) {
  const meetingAiSummary = require('./meetingAiSummary.service');
  return meetingAiSummary.applySummaryResult(meetingId, payload);
}

async function deleteMeetingStorage(meeting) {
  if (!meeting || !objectStorage.isEnabled()) return;
  const paths = [meeting.audioStoragePath, meeting.tempStoragePath].filter(Boolean);
  await objectStorage.deleteObjects(paths);
  const segments = await meetingRecordingSegmentService.listSegments(meeting._id || meeting.id);
  for (const seg of segments) {
    await meetingRecordingSegmentService.deleteSegmentStorage(seg);
  }
}

module.exports = {
  MIN_RECORDING_SEC,
  isRecordingEnabled,
  userCanAccessMeetingRecording,
  enrichMeetingRecordingFields,
  loadSegmentsForMeeting,
  handleUpload,
  getRecordingPayload,
  streamRecording,
  applyWorkerResult,
  applyTranscriptChunk,
  applySummaryResult,
  deleteMeetingStorage,
  resolveRoomKey,
  computeDurationSec,
};
