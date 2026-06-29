const mongoose = require('../db');
const Meeting = require('../models/Meeting');
const meetingService = require('./meeting.service');
const voiceRoomLobby = require('./voiceRoomLobby.service');
const { isFreePublicLobbyRoom } = require('../utils/voiceRoomKind');
const { logger } = require('@enterprise/shared');

const MIN_RECORDING_SEC = 180;

/** @type {Map<string, { meetingId: string, startedAt: number, userIds: Set<string>, peakPeers: number, organizationId?: string }>} */
const activeByRoom = new Map();

function toObjectIdOrNull(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!mongoose.Types.ObjectId.isValid(s)) return null;
  return new mongoose.Types.ObjectId(s);
}

async function onUserJoinRoom({ roomId, userId, organizationId, channelLabel, peerCount }) {
  const roomKey = String(roomId);
  const uid = String(userId);
  let session = activeByRoom.get(roomKey);

  if (!session) {
    let hostOid = toObjectIdOrNull(uid);
    if (isFreePublicLobbyRoom(roomKey)) {
      try {
        const lobby = await voiceRoomLobby.getLobby(roomKey);
        if (lobby?.hostUserId) {
          hostOid = toObjectIdOrNull(lobby.hostUserId);
        }
      } catch (lobbyErr) {
        logger.warn(`voice session lobby host lookup failed room=${roomKey}: ${lobbyErr.message}`);
      }
    }
    if (!hostOid) {
      throw new Error('Invalid user id for voice session');
    }
    const orgOid = toObjectIdOrNull(organizationId);
    const channelOid = toObjectIdOrNull(roomKey);
    const titleBase = String(channelLabel || 'Voice').trim() || 'Voice';
    const meeting = new Meeting({
      title: `Họp thoại — ${titleBase}`.slice(0, 120),
      hostId: hostOid,
      organizationId: orgOid || undefined,
      voiceChannelId: channelOid || undefined,
      lobbyRoomId: isFreePublicLobbyRoom(roomKey) ? roomKey : undefined,
      status: 'active',
      startTime: new Date(),
      isRecording: true,
      participants: [{ userId: hostOid, joinedAt: new Date() }],
    });
    await meeting.save();
    session = {
      meetingId: String(meeting._id),
      startedAt: Date.now(),
      userIds: new Set([uid]),
      peakPeers: Math.max(1, Number(peerCount) || 1),
      organizationId: organizationId ? String(organizationId) : undefined,
    };
    activeByRoom.set(roomKey, session);
    logger.info(`Voice room session started meeting=${session.meetingId} room=${roomKey}`);
    return { meetingId: session.meetingId, isNew: true };
  }

  session.userIds.add(uid);
  session.peakPeers = Math.max(session.peakPeers, Number(peerCount) || 1);
  try {
    await meetingService.addParticipant(session.meetingId, uid);
  } catch (error) {
    logger.warn(`addParticipant voice session failed: ${error.message}`);
  }
  return { meetingId: session.meetingId, isNew: false };
}

async function finalizeRoomSession(roomId) {
  const roomKey = String(roomId);
  const session = activeByRoom.get(roomKey);
  if (!session) return null;

  activeByRoom.delete(roomKey);
  const durationSec = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
  const uniqueParticipants = session.userIds.size;
  /** Ghi từ lúc vào phòng; chỉ persist bản ghi khi phiên >= 3 phút. */
  const shouldSaveRecording = durationSec >= MIN_RECORDING_SEC;

  if (shouldSaveRecording) {
    await Meeting.findByIdAndUpdate(session.meetingId, {
      $set: {
        status: 'ended',
        endTime: new Date(),
        isRecording: false,
        recordingStatus: 'pending_upload',
        durationSec: durationSec,
        recordingUrl: null,
      },
    });
    logger.info(
      `Voice room session saved meeting=${session.meetingId} room=${roomKey} duration=${durationSec}s`
    );
  } else {
    await Meeting.findByIdAndDelete(session.meetingId);
    logger.info(
      `Voice room session discarded (<${MIN_RECORDING_SEC}s) meeting=${session.meetingId} room=${roomKey} duration=${durationSec}s`
    );
  }

  if (isFreePublicLobbyRoom(roomKey)) {
    try {
      await voiceRoomLobby.destroyLobby(roomKey);
    } catch (lobbyErr) {
      logger.warn(`voice lobby destroy failed room=${roomKey}: ${lobbyErr.message}`);
    }
  }

  return {
    roomId: roomKey,
    meetingId: shouldSaveRecording ? session.meetingId : null,
    durationSec,
    peakPeers: session.peakPeers,
    uniqueParticipants,
    recordingSaved: shouldSaveRecording,
  };
}

async function finalizeOrphanMeeting(meeting, { hardDelete = false } = {}) {
  if (!meeting || meeting.status !== 'active') return null;

  const meetingId = String(meeting._id || meeting.id || '');
  if (!meetingId) return null;

  const startedAt = meeting.startTime ? new Date(meeting.startTime).getTime() : Date.now();
  const durationSec = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));

  if (hardDelete) {
    await Meeting.findByIdAndDelete(meetingId);
    logger.info(`Voice orphan meeting hard-deleted meeting=${meetingId} duration=${durationSec}s`);
    return { meetingId, durationSec, recordingSaved: false, deleted: true };
  }

  const shouldSaveRecording = durationSec >= MIN_RECORDING_SEC;

  if (shouldSaveRecording) {
    await Meeting.findByIdAndUpdate(meetingId, {
      $set: {
        status: 'ended',
        endTime: new Date(),
        isRecording: false,
        recordingStatus: 'pending_upload',
        durationSec: durationSec,
        recordingUrl: null,
      },
    });
    logger.info(`Voice orphan meeting ended meeting=${meetingId} duration=${durationSec}s`);
  } else {
    await Meeting.findByIdAndDelete(meetingId);
    logger.info(`Voice orphan meeting deleted meeting=${meetingId} duration=${durationSec}s`);
  }

  return {
    meetingId,
    durationSec,
    recordingSaved: shouldSaveRecording,
    deleted: !shouldSaveRecording,
  };
}

async function cleanupOrphanActiveMeetings({ maxAgeMs = 0, hardDelete = false } = {}) {
  const filter = { status: 'active' };
  if (maxAgeMs > 0) {
    filter.startTime = { $lt: new Date(Date.now() - maxAgeMs) };
  }

  const meetings = await Meeting.find(filter).lean();
  const results = [];
  for (const meeting of meetings) {
    const result = await finalizeOrphanMeeting(meeting, { hardDelete });
    if (result) results.push(result);
  }
  return results;
}

module.exports = {
  MIN_RECORDING_SEC,
  onUserJoinRoom,
  finalizeRoomSession,
  finalizeOrphanMeeting,
  cleanupOrphanActiveMeetings,
};
