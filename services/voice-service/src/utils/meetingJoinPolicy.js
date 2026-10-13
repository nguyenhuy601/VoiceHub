const { createMeetingError, MEETING_ERROR_CODES } = require('./meetingAccessPolicy');
const { assertOrgVoiceChannelAccess } = require('./orgVoiceChannelAccess');

/**
 * RULE-01: không cho JWT + đoán meetingId tự join.
 * Host / từng là participant / org channel member → ok; còn lại 403.
 */
async function assertCanJoinMeeting(meeting, userId, { authorizationHeader } = {}) {
  const uid = String(userId || '').trim();
  if (!meeting || !uid) {
    throw createMeetingError(403, MEETING_ERROR_CODES.FORBIDDEN, 'Forbidden');
  }

  const hostId = String(meeting.hostId?._id || meeting.hostId || '');
  if (hostId === uid) return;

  const wasParticipant = (meeting.participants || []).some(
    (p) => String(p.userId?._id || p.userId) === uid
  );
  if (wasParticipant) return;

  const orgId = String(meeting.organizationId || '').trim();
  if (orgId) {
    const channelId = String(meeting.voiceChannelId || meeting._id || '').trim();
    const access = await assertOrgVoiceChannelAccess({
      userId: uid,
      organizationId: orgId,
      channelId,
      authorizationHeader,
    });
    if (access.allowed) return;
    throw createMeetingError(403, MEETING_ERROR_CODES.FORBIDDEN, 'Forbidden');
  }

  throw createMeetingError(403, MEETING_ERROR_CODES.FORBIDDEN, 'Forbidden');
}

module.exports = { assertCanJoinMeeting };
