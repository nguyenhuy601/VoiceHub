/**
 * Notify SFU + voice sockets after REST moderate (kick / mute).
 */
const roomManager = require('../sfu/roomManager');
const voiceBroadcast = require('../socket/voiceBroadcast');
const { logger } = require('@enterprise/shared');

function resolveMeetingRoomId(meeting) {
  if (!meeting) return '';
  return String(
    meeting.voiceChannelId || meeting.lobbyRoomId || meeting._id || meeting.id || ''
  ).trim();
}

async function notifyParticipantKicked(meeting, { targetUserId, byUserId }) {
  const roomId = resolveMeetingRoomId(meeting);
  const meetingId = String(meeting?._id || meeting?.id || '');
  const payload = {
    meetingId,
    roomId,
    userId: String(targetUserId),
    byUserId: String(byUserId || ''),
  };

  try {
    if (!roomId) return;
    const result = roomManager.leaveRoomByUserId({ roomId, userId: targetUserId });
    const socketIds = (result.removed || [])
      .filter((r) => r.removed && r.socketId)
      .map((r) => r.socketId);
    voiceBroadcast.emitToSocketIds(socketIds, 'voice:participantKicked', payload);
    voiceBroadcast.broadcastToRoom(roomId, 'voice:peerLeft', {
      userId: String(targetUserId),
      reason: 'kicked',
    });
    voiceBroadcast.broadcastToRoom(roomId, 'voice:participantKicked', payload);
  } catch (error) {
    logger.warn(`[voice] notifyParticipantKicked failed: ${error.message}`);
  }
}

async function notifyParticipantMuted(meeting, { targetUserId, byUserId, muted }) {
  const roomId = resolveMeetingRoomId(meeting);
  const meetingId = String(meeting?._id || meeting?.id || '');
  const payload = {
    meetingId,
    roomId,
    userId: String(targetUserId),
    byUserId: String(byUserId || ''),
    muted: Boolean(muted),
  };

  try {
    if (roomId && muted) {
      await roomManager.pauseAudioProducersByUserId({ roomId, userId: targetUserId });
    }
    if (roomId) {
      voiceBroadcast.broadcastToRoom(roomId, 'voice:participantMuted', payload);
    }
  } catch (error) {
    logger.warn(`[voice] notifyParticipantMuted failed: ${error.message}`);
  }
}

module.exports = {
  resolveMeetingRoomId,
  notifyParticipantKicked,
  notifyParticipantMuted,
};
