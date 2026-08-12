const fs = require('fs');
const path = require('path');
const os = require('os');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const { logger } = require('@enterprise/shared');
const roomManager = require('../sfu/roomManager');
const objectStorage = require('../utils/objectStorage');
const meetingRecordingSegmentService = require('./meetingRecordingSegment.service');
const { startFfmpegRtpListener } = require('../utils/plainTransportFfmpeg');

const execFileAsync = promisify(execFile);

/** @type {Map<string, RoomRecordingState>} */
const roomStates = new Map();

let nextRtpPort = 50200;

function isLegacyAutoRecord() {
  return String(process.env.VOICE_RECORDING_LEGACY_AUTO || 'false').toLowerCase() === 'true';
}

function isServerRecordingEnabled() {
  if (String(process.env.VOICE_RECORDING_ENABLED || 'true').toLowerCase() === 'false') {
    return false;
  }
  const mode = String(process.env.VOICE_RECORDING_MODE || 'server').toLowerCase();
  return mode === 'server' || mode === 'both';
}

function isClientRecordingEnabled() {
  const mode = String(process.env.VOICE_RECORDING_MODE || 'server').toLowerCase();
  return mode === 'client' || mode === 'both';
}

function getRecordingMode() {
  return String(process.env.VOICE_RECORDING_MODE || 'server').toLowerCase();
}

function opusBitrateKbps() {
  return Math.min(
    Math.max(parseInt(process.env.VOICE_RECORDING_OPUS_BITRATE_KBPS || '16', 10) || 16, 8),
    48
  );
}

/** Mặc định 2048 để discard webm chỉ header (~550B). Override bằng VOICE_RECORDING_MIN_BYTES. */
function minRecordingBytes() {
  const raw = process.env.VOICE_RECORDING_MIN_BYTES;
  if (raw === undefined || raw === '') return 2048;
  return Math.max(0, parseInt(raw, 10) || 0);
}

/** File 0 byte luôn discard (kể cả khi MIN_BYTES=0). */
function segmentHasUsableBytes(size) {
  const n = Number(size) || 0;
  if (n <= 0) return false;
  return n >= minRecordingBytes();
}

function allocPortPair() {
  const rtp = nextRtpPort;
  nextRtpPort += 2;
  if (nextRtpPort > 52000) nextRtpPort = 50200;
  return { rtp, rtcp: rtp + 1 };
}

function roomTmpDir(roomId) {
  const safe = String(roomId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(os.tmpdir(), 'vh-room-rec', safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureRoomState(roomId, meetingId) {
  const key = String(roomId);
  if (!roomStates.has(key)) {
    roomStates.set(key, {
      roomId: key,
      meetingId: meetingId ? String(meetingId) : null,
      activeSegments: new Map(),
      sessionSegments: [],
      userRecordingSession: null,
      tmpDir: roomTmpDir(key),
    });
  } else if (meetingId) {
    roomStates.get(key).meetingId = String(meetingId);
  }
  return roomStates.get(key);
}

function isRecordingActive(roomId) {
  const state = roomStates.get(String(roomId));
  if (!state) return isLegacyAutoRecord();
  return Boolean(state.userRecordingSession) || isLegacyAutoRecord();
}

async function readSegmentRtpStats(segment) {
  const out = { consumerPackets: null, consumerBytes: null, transportBytesSent: null };
  if (!segment) return out;
  try {
    const stats = await segment.consumer?.getStats?.();
    const list = Array.isArray(stats) ? stats : stats ? [stats] : [];
    const outbound = list.find((s) => s?.type === 'outbound-rtp') || list[0];
    if (outbound) {
      out.consumerPackets = outbound.packetCount ?? outbound.packetsSent ?? null;
      out.consumerBytes = outbound.byteCount ?? outbound.bytesSent ?? null;
    }
  } catch {
    /* ignore */
  }
  try {
    const tStats = await segment.plainTransport?.getStats?.();
    const list = Array.isArray(tStats) ? tStats : tStats ? [tStats] : [];
    const transport = list.find((s) => s?.type === 'plain-rtp-transport' || s?.type === 'transport') || list[0];
    if (transport) {
      out.transportBytesSent = transport.bytesSent ?? transport.byteCount ?? null;
    }
  } catch {
    /* ignore */
  }
  return out;
}

async function stopSegment(segment) {
  if (!segment) return;
  try {
    segment.consumer?.close();
  } catch {
    /* ignore */
  }
  try {
    segment.plainTransport?.close();
  } catch {
    /* ignore */
  }
  if (segment.ffmpeg && !segment.ffmpeg.killed) {
    segment.ffmpeg.kill('SIGINT');
    await new Promise((resolve) => {
      const stopWaitMs = Math.min(
        Math.max(parseInt(process.env.VOICE_RECORDING_FFMPEG_STOP_MS || '800', 10) || 800, 200),
        3000
      );
      const timer = setTimeout(() => {
        try {
          segment.ffmpeg.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve();
      }, stopWaitMs);
      segment.ffmpeg.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  try {
    if (segment.sdpPath && fs.existsSync(segment.sdpPath)) fs.unlinkSync(segment.sdpPath);
  } catch {
    /* ignore */
  }
}

async function attachProducer({ roomId, producerId, userId, displayName, meetingId }) {
  if (!isServerRecordingEnabled()) return;
  if (!objectStorage.isEnabled()) return;
  if (!isRecordingActive(roomId)) return;

  const room = roomManager.getRoom(roomId);
  const found = roomManager.findProducer(roomId, producerId);
  if (!room || !found?.producer || found.producer.kind !== 'audio') return;

  const state = ensureRoomState(roomId, meetingId);
  if (state.activeSegments.has(producerId)) return;

  const { rtp: ffmpegRtpPort, rtcp: ffmpegRtcpPort } = allocPortPair();
  const segmentId = `${String(userId || 'peer')}-${Date.now()}`;
  const sdpPath = path.join(state.tmpDir, `${segmentId}.sdp`);
  const outPath = path.join(state.tmpDir, `${segmentId}.webm`);

  try {
    const tap = await startFfmpegRtpListener({
      room,
      producer: found.producer,
      rtpPort: ffmpegRtpPort,
      rtcpPort: ffmpegRtcpPort,
      sdpPath,
      outPath,
      opusBitrateKbps: opusBitrateKbps(),
      logTag: 'room-rec',
    });

    if (tap.producerPaused) {
      logger.warn(
        `[room-rec] producer paused at attach room=${roomId} producer=${producerId} — no RTP until unmuted`
      );
    }

    const segment = {
      segmentId,
      producerId,
      userId: String(userId || ''),
      displayName: String(displayName || ''),
      outPath,
      sdpPath,
      plainTransport: tap.plainTransport,
      consumer: tap.consumer,
      ffmpeg: tap.ffmpeg,
      payloadType: tap.payloadType,
      producerPausedAtAttach: tap.producerPaused,
      getFfmpegStderr: tap.getFfmpegStderr,
      startedAt: Date.now(),
    };

    state.activeSegments.set(producerId, segment);

    const onProducerClosed = () => {
      void detachProducer(roomId, producerId);
    };
    found.producer.once('close', onProducerClosed);

    logger.info(
      `[room-rec] segment started room=${roomId} user=${userId} producer=${producerId} pt=${tap.payloadType} producerPaused=${tap.producerPaused}`
    );
  } catch (err) {
    logger.warn(`[room-rec] attachProducer failed room=${roomId}: ${err.message}`);
    try {
      if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);
    } catch {
      /* ignore */
    }
  }
}

async function detachProducer(roomId, producerId) {
  const state = roomStates.get(String(roomId));
  if (!state) return;
  const segment = state.activeSegments.get(producerId);
  if (!segment) return;
  state.activeSegments.delete(producerId);

  // Stats trước close — sau close consumerPackets luôn null.
  const rtpStats = await readSegmentRtpStats(segment);
  await stopSegment(segment);

  let size = 0;
  try {
    size = fs.statSync(segment.outPath).size;
  } catch {
    size = 0;
  }
  if (segmentHasUsableBytes(size)) {
    state.sessionSegments.push({
      outPath: segment.outPath,
      userId: segment.userId,
      displayName: segment.displayName,
      startedAt: segment.startedAt,
      endedAt: Date.now(),
      bytes: size,
    });
  } else {
    try {
      logger.warn(
        `[room-rec] zero-byte segment room=${roomId} producer=${producerId} producerPausedAtAttach=${Boolean(segment.producerPausedAtAttach)} consumerPackets=${rtpStats.consumerPackets} consumerBytes=${rtpStats.consumerBytes} transportBytesSent=${rtpStats.transportBytesSent} ffmpegErr=${(segment.getFfmpegStderr?.() || '').slice(0, 300)}`
      );
      if (fs.existsSync(segment.outPath)) fs.unlinkSync(segment.outPath);
    } catch {
      /* ignore */
    }
  }
  logger.info(`[room-rec] segment stopped room=${roomId} producer=${producerId} bytes=${size}`);
}

/**
 * Sau unmute: gắn FFmpeg nếu chưa có; restart segment nếu attach lúc mic đang pause
 * (tránh file 0 byte rồi vẫn “queued” khi MIN_BYTES=0).
 */
async function ensureProducerRecordingAfterResume({
  roomId,
  producerId,
  userId,
  displayName,
  meetingId,
}) {
  if (!isServerRecordingEnabled() || !objectStorage.isEnabled()) return;
  if (!isRecordingActive(roomId)) return;

  const state = roomStates.get(String(roomId));
  if (!state?.userRecordingSession) return;

  const existing = state.activeSegments.get(producerId);
  if (existing?.producerPausedAtAttach) {
    logger.info(
      `[room-rec] restart segment after unmute room=${roomId} producer=${producerId}`
    );
    await detachProducer(roomId, producerId);
    await attachProducer({ roomId, producerId, userId, displayName, meetingId });
    return;
  }
  if (!existing) {
    await attachProducer({ roomId, producerId, userId, displayName, meetingId });
  }
}

async function attachAllRoomProducers(roomId, meetingId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;
  for (const peer of room.peers.values()) {
    for (const producer of peer.producers.values()) {
      if (producer.kind !== 'audio') continue;
      await attachProducer({
        roomId,
        producerId: producer.id,
        userId: peer.userInfo?.userId,
        displayName: peer.userInfo?.displayName,
        meetingId,
      });
    }
  }
}

async function mergeSegmentsToOpus(segmentPaths, outputPath, bitrateKbps) {
  if (!segmentPaths.length) return false;
  if (segmentPaths.length === 1) {
    await execFileAsync('ffmpeg', [
      '-loglevel',
      'warning',
      '-y',
      '-i',
      segmentPaths[0],
      '-vn',
      '-c:a',
      'libopus',
      '-b:a',
      `${bitrateKbps}k`,
      '-application',
      'voip',
      outputPath,
    ]);
    return fs.existsSync(outputPath);
  }

  const inputs = segmentPaths.flatMap((p) => ['-i', p]);
  const filter = `${segmentPaths.map((_, i) => `[${i}:a]`).join('')}amix=inputs=${segmentPaths.length}:duration=longest:dropout_transition=0[aout]`;
  await execFileAsync('ffmpeg', [
    '-loglevel',
    'warning',
    '-y',
    ...inputs,
    '-filter_complex',
    filter,
    '-map',
    '[aout]',
    '-c:a',
    'libopus',
    '-b:a',
    `${bitrateKbps}k`,
    '-application',
    'voip',
    outputPath,
  ]);
  return fs.existsSync(outputPath);
}

async function finalizeSessionSegments(state, { startedBy, startedAt, meetingId, roomId, durationSec, skipTranscript, segmentPaths: pathsIn = null }) {
  const segmentPaths = (pathsIn || state.sessionSegments.map((s) => s.outPath)).filter((p) => fs.existsSync(p));
  state.sessionSegments = [];

  if (!segmentPaths.length) return null;

  const mergedLocal = path.join(state.tmpDir, `merged-${randomUUID()}.opus`);
  const bitrate = opusBitrateKbps();
  const endedAt = new Date();
  const segDuration = Math.max(
    0,
    Math.floor((endedAt.getTime() - (startedAt || endedAt).getTime()) / 1000)
  );

  const cleanupPaths = () => {
    for (const p of segmentPaths) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
  };

  try {
    if (segmentPaths.length === 1) {
      let size = 0;
      try {
        size = fs.statSync(segmentPaths[0]).size;
      } catch {
        size = 0;
      }
      if (!segmentHasUsableBytes(size)) {
        cleanupPaths();
        return null;
      }

      const roomKey = String(roomId);
      const fileBuffer = fs.readFileSync(segmentPaths[0]);
      const segmentIndex = await meetingRecordingSegmentService.getNextSegmentIndex(meetingId);
      return meetingRecordingSegmentService.handleClientSegmentUpload({
        meetingId,
        userId: startedBy,
        segmentIndex,
        fileBuffer,
        mimeType: 'audio/webm',
        durationSec: segDuration || durationSec,
        roomKey,
        skipTranscript: skipTranscript || false,
      });
    }

    const ok = await mergeSegmentsToOpus(segmentPaths, mergedLocal, bitrate);
    if (!ok || !fs.existsSync(mergedLocal)) return null;

    const fileBuffer = fs.readFileSync(mergedLocal);
    if (!fileBuffer.length) return null;

    const roomKey = String(roomId);
    const storagePath = `meeting-recordings/${roomKey.replace(/[^a-zA-Z0-9_-]/g, '_')}/${meetingId}_seg_${Date.now()}.opus`;
    await objectStorage.putObject(storagePath, fileBuffer, 'audio/opus');

    return meetingRecordingSegmentService.createSegmentFromServerFinalize({
      meetingId,
      startedBy,
      startedAt: startedAt || new Date(endedAt.getTime() - segDuration * 1000),
      endedAt,
      audioStoragePath: storagePath,
      durationSec: segDuration || durationSec,
      roomKey,
      skipTranscript,
    });
  } catch (err) {
    logger.error(`[room-rec] finalize session failed room=${roomId}: ${err.message}`);
    return null;
  } finally {
    try {
      if (fs.existsSync(mergedLocal)) fs.unlinkSync(mergedLocal);
    } catch {
      /* ignore */
    }
    cleanupPaths();
  }
}

async function startUserSegment({ roomId, userId, meetingId, skipTranscript = false }) {
  if (!isServerRecordingEnabled()) {
    const err = new Error('Server recording is disabled');
    err.statusCode = 503;
    throw err;
  }
  if (!objectStorage.isEnabled()) {
    const err = new Error('Object storage (MinIO) is not configured — recording unavailable');
    err.statusCode = 503;
    throw err;
  }
  const state = ensureRoomState(roomId, meetingId);
  if (state.userRecordingSession) {
    logger.info(`[room-rec] user segment already active room=${roomId} user=${userId}`);
    return { started: true, startedAt: state.userRecordingSession.startedAt, alreadyActive: true };
  }

  state.userRecordingSession = {
    startedBy: String(userId),
    startedAt: new Date(),
    skipTranscript,
  };
  state.sessionSegments = [];

  await attachAllRoomProducers(roomId, meetingId);
  logger.info(`[room-rec] user segment started room=${roomId} user=${userId}`);
  return { started: true, startedAt: state.userRecordingSession.startedAt };
}

async function stopUserSegment({
  roomId,
  meetingId,
  durationSec = 0,
  skipTranscript = false,
  deferFinalize = true,
}) {
  const state = roomStates.get(String(roomId));
  if (!state?.userRecordingSession) {
    return {
      segment: null,
      stopped: true,
      alreadyStopped: true,
      processing: false,
      savedSegmentCount: 0,
      totalBytes: 0,
    };
  }

  for (const producerId of [...state.activeSegments.keys()]) {
    await detachProducer(roomId, producerId);
  }

  const session = state.userRecordingSession;
  state.userRecordingSession = null;

  const kept = state.sessionSegments.filter((s) => s?.outPath && fs.existsSync(s.outPath));
  const segmentPaths = kept.map((s) => s.outPath);
  const totalBytes = kept.reduce((sum, s) => {
    if (Number(s.bytes) > 0) return sum + Number(s.bytes);
    try {
      return sum + fs.statSync(s.outPath).size;
    } catch {
      return sum;
    }
  }, 0);
  const savedSegmentCount = segmentPaths.length;
  state.sessionSegments = [];

  const finalizeCtx = {
    startedBy: session.startedBy,
    startedAt: session.startedAt,
    meetingId: meetingId || state.meetingId,
    roomId,
    durationSec,
    skipTranscript: skipTranscript || session.skipTranscript,
    segmentPaths,
  };

  if (!segmentPaths.length) {
    logger.info(`[room-rec] user segment stopped room=${roomId} queued=0 totalBytes=0`);
    return {
      segment: null,
      stopped: true,
      processing: false,
      savedSegmentCount: 0,
      totalBytes: 0,
    };
  }

  if (deferFinalize) {
    setImmediate(() => {
      void finalizeSessionSegments(state, finalizeCtx).then((segment) => {
        if (segment) {
          logger.info(`[room-rec] user segment finalized room=${roomId} segment=${segment.id}`);
        }
      });
    });
    logger.info(
      `[room-rec] user segment stopped room=${roomId} queued=${savedSegmentCount} totalBytes=${totalBytes}`
    );
    return {
      segment: null,
      stopped: true,
      processing: true,
      savedSegmentCount,
      totalBytes,
    };
  }

  const segment = await finalizeSessionSegments(state, finalizeCtx);
  if (segment) {
    logger.info(`[room-rec] user segment finalized room=${roomId} segment=${segment.id}`);
  }
  logger.info(`[room-rec] user segment stopped room=${roomId} queued=0 totalBytes=${totalBytes}`);
  return {
    segment,
    stopped: true,
    processing: false,
    savedSegmentCount,
    totalBytes,
  };
}

async function finalizeRoom(roomId, meetingId, durationSec = 0, { skipTranscript = false } = {}) {
  if (!isServerRecordingEnabled()) return null;
  const state = roomStates.get(String(roomId));
  if (!state) return null;

  const mid = String(meetingId || state.meetingId || '').trim();
  if (!mid) {
    await discardRoom(roomId);
    return null;
  }

  if (state.userRecordingSession) {
    await stopUserSegment({
      roomId,
      meetingId: mid,
      durationSec,
      skipTranscript,
      deferFinalize: false,
    });
  }

  for (const producerId of [...state.activeSegments.keys()]) {
    await detachProducer(roomId, producerId);
  }

  if (!isLegacyAutoRecord()) {
    roomStates.delete(String(roomId));
    cleanupTmpDir(state.tmpDir);
    return null;
  }

  const segmentPaths = state.sessionSegments.map((s) => s.outPath).filter((p) => fs.existsSync(p));
  roomStates.delete(String(roomId));

  if (!segmentPaths.length) {
    cleanupTmpDir(state.tmpDir);
    return null;
  }

  const mergedLocal = path.join(state.tmpDir, `merged-${randomUUID()}.opus`);
  const bitrate = opusBitrateKbps();
  try {
    const ok = await mergeSegmentsToOpus(segmentPaths, mergedLocal, bitrate);
    if (!ok || !fs.existsSync(mergedLocal)) {
      cleanupTmpDir(state.tmpDir);
      return null;
    }
    const fileBuffer = fs.readFileSync(mergedLocal);
    if (!fileBuffer.length) {
      cleanupTmpDir(state.tmpDir);
      return null;
    }

    const roomKey = String(roomId);
    const storagePath = `meeting-recordings/${roomKey.replace(/[^a-zA-Z0-9_-]/g, '_')}/${mid}_${Date.now()}.opus`;
    await objectStorage.putObject(storagePath, fileBuffer, 'audio/opus');

    const segment = await meetingRecordingSegmentService.createSegmentFromServerFinalize({
      meetingId: mid,
      startedBy: state.userRecordingSession?.startedBy || mid,
      startedAt: new Date(Date.now() - Number(durationSec) * 1000),
      endedAt: new Date(),
      audioStoragePath: storagePath,
      durationSec: Number(durationSec) || 0,
      roomKey,
      skipTranscript,
    });

    cleanupTmpDir(state.tmpDir);
    return { meetingId: mid, audioStoragePath: storagePath, durationSec, segment };
  } catch (err) {
    logger.error(`[room-rec] finalize failed room=${roomId}: ${err.message}`);
    cleanupTmpDir(state.tmpDir);
    return null;
  }
}

async function discardRoom(roomId) {
  const state = roomStates.get(String(roomId));
  if (!state) return;
  state.userRecordingSession = null;
  state.sessionSegments = [];
  for (const producerId of [...state.activeSegments.keys()]) {
    await detachProducer(roomId, producerId);
  }
  roomStates.delete(String(roomId));
  cleanupTmpDir(state.tmpDir);
}

function cleanupTmpDir(dir) {
  try {
    if (!dir || !fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {
        /* ignore */
      }
    }
    fs.rmdirSync(dir);
  } catch {
    /* ignore */
  }
}

function bindMeeting(roomId, meetingId) {
  if (!meetingId) return;
  ensureRoomState(roomId, meetingId);
}

function hasActiveUserRecording(roomId) {
  const state = roomStates.get(String(roomId));
  return Boolean(state?.userRecordingSession);
}

module.exports = {
  isLegacyAutoRecord,
  isServerRecordingEnabled,
  isClientRecordingEnabled,
  getRecordingMode,
  isRecordingActive,
  bindMeeting,
  attachProducer,
  detachProducer,
  attachAllRoomProducers,
  ensureProducerRecordingAfterResume,
  startUserSegment,
  stopUserSegment,
  finalizeRoom,
  discardRoom,
  hasActiveUserRecording,
  segmentHasUsableBytes,
  minRecordingBytes,
};
