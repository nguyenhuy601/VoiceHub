const MeetingRecordingSegment = require('../models/MeetingRecordingSegment');
const Meeting = require('../models/Meeting');
const objectStorage = require('../utils/objectStorage');
const { publishJson } = require('../messaging/rabbit');
const { VOICE_RECORDING_PROCESS_QUEUE } = require('@enterprise/shared/messaging/voiceRecordingEvents');
const { segmentMeetsMinDuration, MIN_RECORDING_SEC } = require('../utils/meetingPersistPolicy');
const { logger } = require('@enterprise/shared');

function mapSegment(doc) {
  if (!doc) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    id: String(plain._id),
    meetingId: String(plain.meetingId),
    segmentIndex: plain.segmentIndex,
    startedBy: String(plain.startedBy),
    startedAt: plain.startedAt,
    endedAt: plain.endedAt,
    durationSec: plain.durationSec || 0,
    status: plain.status,
    hasAudio: plain.status === 'ready' && Boolean(plain.audioStoragePath),
  };
}

async function getNextSegmentIndex(meetingId) {
  const last = await MeetingRecordingSegment.findOne({ meetingId })
    .sort({ segmentIndex: -1 })
    .select('segmentIndex')
    .lean();
  return last ? last.segmentIndex + 1 : 0;
}

async function listSegments(meetingId) {
  const rows = await MeetingRecordingSegment.find({ meetingId })
    .sort({ segmentIndex: 1 })
    .lean();
  return rows.map(mapSegment);
}

async function countReadySegments(meetingId) {
  return MeetingRecordingSegment.countDocuments({
    meetingId,
    status: { $in: ['ready', 'processing', 'audio_expired'] },
  });
}

async function createSegmentFromServerFinalize({
  meetingId,
  startedBy,
  startedAt,
  endedAt,
  audioStoragePath,
  durationSec,
  roomKey,
  skipTranscript = true,
  transcriptSource = 'realtime',
}) {
  const segmentIndex = await getNextSegmentIndex(meetingId);
  const segment = await MeetingRecordingSegment.create({
    meetingId,
    segmentIndex,
    startedBy,
    startedAt: startedAt || new Date(),
    endedAt: endedAt || new Date(),
    audioStoragePath,
    durationSec: Number(durationSec) || 0,
    status: 'processing',
  });

  await Meeting.findByIdAndUpdate(meetingId, {
    $set: {
      recordingStatus: 'processing',
      isRecording: false,
    },
  });

  try {
    await publishJson(VOICE_RECORDING_PROCESS_QUEUE, {
      jobType: 'segment_finalize',
      meetingId: String(meetingId),
      segmentId: String(segment._id),
      segmentIndex,
      roomKey,
      audioStoragePath,
      durationSec: Number(durationSec) || 0,
      skipTranscode: true,
      skipTranscript,
      transcriptSource,
    });
  } catch (publishErr) {
    await MeetingRecordingSegment.findByIdAndUpdate(segment._id, {
      $set: { status: 'failed' },
    });
    logger.error(
      `Recording segment queue publish failed meeting=${meetingId} segment=${segmentIndex}: ${publishErr.message}`
    );
    throw publishErr;
  }

  logger.info(
    `Recording segment queued meeting=${meetingId} segment=${segmentIndex} path=${audioStoragePath}`
  );
  return mapSegment(segment);
}

async function applySegmentWorkerResult(segmentId, payload) {
  const update = {
    status: payload.recordingStatus || payload.status || 'ready',
    audioStoragePath: payload.audioStoragePath || undefined,
    durationSec: payload.durationSec ?? undefined,
    tempStoragePath: null,
  };
  if (payload.error) update.status = 'failed';

  const segment = await MeetingRecordingSegment.findByIdAndUpdate(
    segmentId,
    { $set: update },
    { new: true }
  ).lean();

  if (!segment) return null;

  const readyCount = await MeetingRecordingSegment.countDocuments({
    meetingId: segment.meetingId,
    status: 'ready',
  });
  const processingCount = await MeetingRecordingSegment.countDocuments({
    meetingId: segment.meetingId,
    status: 'processing',
  });

  let meetingRecordingStatus = 'none';
  if (readyCount > 0 && processingCount === 0) meetingRecordingStatus = 'ready';
  else if (processingCount > 0 || readyCount > 0) meetingRecordingStatus = 'processing';

  const meetingUpdate = { recordingStatus: meetingRecordingStatus };
  if (payload.audioStoragePath && segment.segmentIndex === 0) {
    meetingUpdate.audioStoragePath = payload.audioStoragePath;
  }

  await Meeting.findByIdAndUpdate(segment.meetingId, { $set: meetingUpdate });

  if (payload.tempStoragePath && update.status === 'ready') {
    await objectStorage.deleteObject(payload.tempStoragePath);
  }
  return mapSegment(segment);
}

async function getSegmentById(segmentId, meetingId) {
  const segment = await MeetingRecordingSegment.findOne({
    _id: segmentId,
    meetingId,
  }).lean();
  return mapSegment(segment);
}

async function streamSegment(segmentId, meetingId) {
  const segment = await MeetingRecordingSegment.findOne({
    _id: segmentId,
    meetingId,
    status: 'ready',
  }).lean();
  if (!segment?.audioStoragePath) {
    const err = new Error('Segment audio not available');
    err.statusCode = 404;
    throw err;
  }
  return {
    stream: await objectStorage.getObjectStream(segment.audioStoragePath),
    contentType: 'audio/opus',
  };
}

async function handleClientSegmentUpload({
  meetingId,
  userId,
  segmentIndex,
  fileBuffer,
  mimeType,
  durationSec,
  roomKey,
  skipTranscript = true,
}) {
  const duration = Number(durationSec) || 0;
  if (!segmentMeetsMinDuration(duration)) {
    const err = new Error(`Recording segment must be at least ${MIN_RECORDING_SEC} seconds`);
    err.statusCode = 400;
    throw err;
  }

  const { randomUUID } = require('crypto');
  const tempStoragePath = `temp/meeting-recordings/${meetingId}/seg_${segmentIndex}_${randomUUID()}.webm`;
  await objectStorage.putObject(tempStoragePath, fileBuffer, mimeType || 'audio/webm');

  let segment = await MeetingRecordingSegment.findOne({ meetingId, segmentIndex });
  if (!segment) {
    segment = await MeetingRecordingSegment.create({
      meetingId,
      segmentIndex,
      startedBy: userId,
      startedAt: new Date(Date.now() - duration * 1000),
      endedAt: new Date(),
      tempStoragePath,
      durationSec: duration,
      status: 'processing',
    });
  } else {
    segment.tempStoragePath = tempStoragePath;
    segment.durationSec = duration;
    segment.status = 'processing';
    await segment.save();
  }

  await Meeting.findByIdAndUpdate(meetingId, {
    $set: { recordingStatus: 'processing', isRecording: false },
  });

  await publishJson(VOICE_RECORDING_PROCESS_QUEUE, {
    jobType: 'segment_finalize',
    meetingId: String(meetingId),
    segmentId: String(segment._id),
    segmentIndex,
    roomKey,
    tempStoragePath,
    durationSec: duration,
    skipTranscode: false,
    skipTranscript,
    opusBitrateKbps: Math.min(
      Math.max(parseInt(process.env.VOICE_RECORDING_OPUS_BITRATE_KBPS || '16', 10) || 16, 8),
      48
    ),
  });

  return mapSegment(segment);
}

async function migrateLegacyAudioToSegment(meeting) {
  if (!meeting?.audioStoragePath || !meeting?._id) return null;
  const meetingId = meeting._id;
  const existing = await MeetingRecordingSegment.findOne({ meetingId, segmentIndex: 0 });
  if (existing) return mapSegment(existing);

  const segment = await MeetingRecordingSegment.create({
    meetingId,
    segmentIndex: 0,
    startedBy: meeting.hostId,
    startedAt: meeting.startTime || meeting.createdAt,
    endedAt: meeting.endTime || meeting.updatedAt,
    audioStoragePath: meeting.audioStoragePath,
    durationSec: meeting.durationSec || 0,
    status: meeting.recordingStatus === 'ready' ? 'ready' : 'processing',
  });
  return mapSegment(segment);
}

async function deleteSegmentStorage(segment) {
  if (!segment || !objectStorage.isEnabled()) return;
  const paths = [segment.audioStoragePath, segment.tempStoragePath].filter(Boolean);
  await objectStorage.deleteObjects(paths);
}

module.exports = {
  mapSegment,
  listSegments,
  countReadySegments,
  getNextSegmentIndex,
  createSegmentFromServerFinalize,
  applySegmentWorkerResult,
  getSegmentById,
  streamSegment,
  handleClientSegmentUpload,
  migrateLegacyAudioToSegment,
  deleteSegmentStorage,
};
