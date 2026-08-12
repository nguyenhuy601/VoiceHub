const mongoose = require('../db');
const VoiceRoomLobby = require('../models/VoiceRoomLobby');
const { isFreePublicLobbyRoom } = require('../utils/voiceRoomKind');

function toObjectId(userId) {
  const s = String(userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(s)) {
    const err = new Error('Invalid user id');
    err.statusCode = 400;
    throw err;
  }
  return new mongoose.Types.ObjectId(s);
}

async function getLobby(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid) return null;
  return VoiceRoomLobby.findOne({ roomId: rid }).lean();
}

async function registerHost(roomId, hostUserId) {
  const rid = String(roomId || '').trim();
  if (!isFreePublicLobbyRoom(rid)) {
    const err = new Error('Room does not support lobby host registration');
    err.statusCode = 400;
    throw err;
  }
  const hostOid = toObjectId(hostUserId);
  const existing = await VoiceRoomLobby.findOne({ roomId: rid });
  if (existing) {
    if (String(existing.hostUserId) !== String(hostOid)) {
      const err = new Error('Room already has a host');
      err.statusCode = 409;
      throw err;
    }
    return existing.toObject();
  }
  const doc = await VoiceRoomLobby.create({
    roomId: rid,
    hostUserId: hostOid,
    joinPolicy: 'approval',
  });
  return doc.toObject();
}

async function isHost(roomId, userId) {
  const lobby = await getLobby(roomId);
  if (!lobby) return false;
  return String(lobby.hostUserId) === String(userId);
}

/** Chủ phòng: lobby host hoặc hostId của meeting voice đang active. */
async function canActAsRoomHost(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return false;
  if (await isHost(rid, uid)) return true;

  try {
    const voiceRoomSessionService = require('./voiceRoomSession.service');
    const Meeting = require('../models/Meeting');
    const meetingId = voiceRoomSessionService.getActiveMeetingId(rid);
    if (!meetingId) return false;
    const meeting = await Meeting.findById(meetingId).select('hostId status').lean();
    if (!meeting || meeting.status !== 'active') return false;
    return String(meeting.hostId) === uid;
  } catch {
    return false;
  }
}

async function requiresApproval(roomId) {
  if (!isFreePublicLobbyRoom(roomId)) return false;
  const lobby = await getLobby(roomId);
  if (!lobby) return false;
  return lobby.joinPolicy === 'approval';
}

async function destroyLobby(roomId) {
  const rid = String(roomId || '').trim();
  if (!rid || !isFreePublicLobbyRoom(rid)) return false;

  const VoiceRoomJoinRequest = require('../models/VoiceRoomJoinRequest');
  await VoiceRoomJoinRequest.deleteMany({ roomId: rid });
  const result = await VoiceRoomLobby.deleteOne({ roomId: rid });

  try {
    const voiceLobbyRedis = require('../presence/voiceLobbyRedis');
    await voiceLobbyRedis.clearLobbyBootstrap?.(rid);
  } catch {
    /* optional redis */
  }

  return result.deletedCount > 0;
}

module.exports = {
  getLobby,
  registerHost,
  isHost,
  canActAsRoomHost,
  requiresApproval,
  isFreePublicLobbyRoom,
  destroyLobby,
};
