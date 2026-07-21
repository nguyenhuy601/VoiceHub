const fs = require('fs');
const path = require('path');
const os = require('os');
const { randomUUID } = require('crypto');
const { logger } = require('@enterprise/shared');
const roomManager = require('../sfu/roomManager');
const objectStorage = require('../utils/objectStorage');
const { publishJson } = require('../messaging/rabbit');
const { VOICE_STT_CHUNK_QUEUE } = require('@enterprise/shared/messaging/voiceSttEvents');
const meetingAiSummary = require('./meetingAiSummary.service');
const { startFfmpegRtpListener } = require('../utils/plainTransportFfmpeg');

/** @type {Map<string, SttTapState>} */
const roomStates = new Map();

let nextRtpPort = 51200;

function isSttEnabled() {
  if (String(process.env.VOICE_STT_ENABLED || 'true').toLowerCase() === 'false') return false;
  return meetingAiSummary.isAiSummaryEnabled();
}

function chunkSec() {
  return Math.min(
    Math.max(parseInt(process.env.VOICE_STT_CHUNK_SEC || '20', 10) || 20, 5),
    60
  );
}

function allocPortPair() {
  const rtp = nextRtpPort;
  nextRtpPort += 2;
  if (nextRtpPort > 53000) nextRtpPort = 51200;
  return { rtp, rtcp: rtp + 1 };
}

function roomTmpDir(roomId) {
  const safe = String(roomId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const dir = path.join(os.tmpdir(), 'vh-room-stt', safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function ensureRoomState(roomId, meetingId) {
  const key = String(roomId);
  if (!roomStates.has(key)) {
    roomStates.set(key, {
      roomId: key,
      meetingId: meetingId ? String(meetingId) : null,
      taps: new Map(),
      tmpDir: roomTmpDir(key),
    });
  } else if (meetingId) {
    roomStates.get(key).meetingId = String(meetingId);
  }
  return roomStates.get(key);
}

async function publishChunk({ meetingId, roomId, userId, displayName, localPath }) {
  if (!objectStorage.isEnabled()) return;
  const buffer = fs.readFileSync(localPath);
  if (!buffer.length) return;

  const storagePath = `temp/stt-chunks/${meetingId}/${randomUUID()}.webm`;
  await objectStorage.putObject(storagePath, buffer, 'audio/webm');

  const seq = meetingAiSummary.nextTranscriptSeq(roomId);
  await publishJson(VOICE_STT_CHUNK_QUEUE, {
    meetingId: String(meetingId),
    roomId: String(roomId),
    storagePath,
    seq,
    speakerId: String(userId || ''),
    displayName: String(displayName || ''),
  });
}

async function stopTap(tap) {
  if (!tap) return;
  try {
    tap.consumer?.close();
  } catch {
    /* ignore */
  }
  try {
    tap.plainTransport?.close();
  } catch {
    /* ignore */
  }
  if (tap.ffmpeg && !tap.ffmpeg.killed) {
    tap.ffmpeg.kill('SIGINT');
    await new Promise((resolve) => {
      const timer = setTimeout(() => {
        try {
          tap.ffmpeg.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        resolve();
      }, 2000);
      tap.ffmpeg.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
  try {
    if (tap.sdpPath && fs.existsSync(tap.sdpPath)) fs.unlinkSync(tap.sdpPath);
  } catch {
    /* ignore */
  }
}

async function rotateTapChunk(roomId, producerId) {
  const state = roomStates.get(String(roomId));
  if (!state) return;
  const tap = state.taps.get(producerId);
  if (!tap) return;

  await stopTap(tap);
  const outPath = tap.outPath;
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
    try {
      await publishChunk({
        meetingId: state.meetingId,
        roomId,
        userId: tap.userId,
        displayName: tap.displayName,
        localPath: outPath,
      });
    } catch (err) {
      logger.warn(`[stt-tap] publish chunk failed: ${err.message}`);
    }
  }
  try {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  } catch {
    /* ignore */
  }

  if (meetingAiSummary.isSummaryActive(roomId)) {
    await attachProducerTap({
      roomId,
      producerId,
      userId: tap.userId,
      displayName: tap.displayName,
      meetingId: state.meetingId,
    });
  } else {
    state.taps.delete(producerId);
  }
}

async function attachProducerTap({ roomId, producerId, userId, displayName, meetingId }) {
  if (!isSttEnabled()) return;
  if (!meetingAiSummary.isSummaryActive(roomId)) return;

  const room = roomManager.getRoom(roomId);
  const found = roomManager.findProducer(roomId, producerId);
  if (!room || !found?.producer || found.producer.kind !== 'audio') return;

  const state = ensureRoomState(roomId, meetingId);
  if (state.taps.has(producerId)) return;

  const { rtp: ffmpegRtpPort, rtcp: ffmpegRtcpPort } = allocPortPair();
  const tapId = `stt-${String(userId || 'peer')}-${Date.now()}`;
  const sdpPath = path.join(state.tmpDir, `${tapId}.sdp`);
  const outPath = path.join(state.tmpDir, `${tapId}.webm`);
  const duration = chunkSec();

  try {
    const tapSession = await startFfmpegRtpListener({
      room,
      producer: found.producer,
      rtpPort: ffmpegRtpPort,
      rtcpPort: ffmpegRtcpPort,
      sdpPath,
      outPath,
      ffmpegExtraArgs: ['-t', String(duration)],
      logTag: 'stt-tap',
    });

    const tap = {
      tapId,
      producerId,
      userId: String(userId || ''),
      displayName: String(displayName || ''),
      outPath,
      sdpPath,
      plainTransport: tapSession.plainTransport,
      consumer: tapSession.consumer,
      ffmpeg: tapSession.ffmpeg,
      producerPausedAtAttach: Boolean(tapSession.producerPaused),
      rotateTimer: null,
    };

    state.taps.set(producerId, tap);

    const scheduleRotate = () => {
      tap.rotateTimer = setTimeout(() => {
        void rotateTapChunk(roomId, producerId);
      }, duration * 1000 + 500);
    };
    tap.ffmpeg.once('exit', scheduleRotate);
    scheduleRotate();

    found.producer.once('close', () => {
      void detachProducerTap(roomId, producerId);
    });
  } catch (err) {
    logger.warn(`[stt-tap] attach failed room=${roomId}: ${err.message}`);
    try {
      if (fs.existsSync(sdpPath)) fs.unlinkSync(sdpPath);
    } catch {
      /* ignore */
    }
  }
}

async function detachProducerTap(roomId, producerId) {
  const state = roomStates.get(String(roomId));
  if (!state) return;
  const tap = state.taps.get(producerId);
  if (!tap) return;
  if (tap.rotateTimer) clearTimeout(tap.rotateTimer);
  state.taps.delete(producerId);
  const outPath = tap.outPath;
  await stopTap(tap);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 512) {
    try {
      await publishChunk({
        meetingId: state.meetingId,
        roomId,
        userId: tap.userId,
        displayName: tap.displayName,
        localPath: outPath,
      });
    } catch {
      /* ignore */
    }
  }
  try {
    if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  } catch {
    /* ignore */
  }
}

async function attachAllRoomProducers(roomId, meetingId) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;
  for (const peer of room.peers.values()) {
    for (const producer of peer.producers.values()) {
      if (producer.kind !== 'audio') continue;
      await attachProducerTap({
        roomId,
        producerId: producer.id,
        userId: peer.userInfo?.userId,
        displayName: peer.userInfo?.displayName,
        meetingId,
      });
    }
  }
}

/**
 * Sau unmute: gắn STT tap nếu AI summary đang bật; restart nếu attach lúc mic pause.
 */
async function ensureProducerSttAfterResume({
  roomId,
  producerId,
  userId,
  displayName,
  meetingId,
}) {
  if (!isSttEnabled()) return;
  if (!meetingAiSummary.isSummaryActive(roomId)) return;

  const state = roomStates.get(String(roomId));
  const existing = state?.taps?.get(producerId);
  if (existing?.producerPausedAtAttach) {
    logger.info(`[stt-tap] restart tap after unmute room=${roomId} producer=${producerId}`);
    await detachProducerTap(roomId, producerId);
    await attachProducerTap({ roomId, producerId, userId, displayName, meetingId });
    return;
  }
  if (!existing) {
    await attachProducerTap({ roomId, producerId, userId, displayName, meetingId });
  }
}

async function startRoomSttTap({ roomId, meetingId }) {
  ensureRoomState(roomId, meetingId);
  await attachAllRoomProducers(roomId, meetingId);
}

async function stopRoomSttTap(roomId) {
  const state = roomStates.get(String(roomId));
  if (!state) return;
  for (const producerId of [...state.taps.keys()]) {
    await detachProducerTap(roomId, producerId);
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

module.exports = {
  isSttEnabled,
  bindMeeting,
  attachProducerTap,
  detachProducerTap,
  attachAllRoomProducers,
  ensureProducerSttAfterResume,
  startRoomSttTap,
  stopRoomSttTap,
};
