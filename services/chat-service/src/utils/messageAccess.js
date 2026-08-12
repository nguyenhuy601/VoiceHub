function resolveParticipantId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object' && value._id != null) return String(value._id).trim();
  return String(value).trim();
}

/**
 * Chỉ cho phép đọc tin nếu user là sender/receiver (DM) hoặc có canRead trên kênh org.
 * @throws {{ statusCode: number, message: string }}
 */
async function assertCanAccessMessage(message, userId, req) {
  const uid = String(userId || '').trim();
  if (!uid || !message) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  const senderId = resolveParticipantId(message.senderId);
  const receiverId = resolveParticipantId(message.receiverId);
  if (senderId === uid || receiverId === uid) {
    return true;
  }
  if (message.organizationId && message.roomId) {
    const { fetchAccessibleChannelPermissionMatrix } = require('./orgChannelPermissions');
    const orgId = String(message.organizationId);
    const { matrix } = await fetchAccessibleChannelPermissionMatrix(orgId, req);
    const perms = matrix[String(message.roomId)] || {};
    if (Boolean(perms.canRead)) {
      return true;
    }
  }
  const err = new Error('Forbidden');
  err.statusCode = 403;
  throw err;
}

/**
 * DM: chỉ receiver được mark read. Tin không có receiverId → từ chối (room dùng API khác).
 */
function assertCanMarkMessageAsRead(message, userId) {
  const uid = String(userId || '').trim();
  const receiverId = resolveParticipantId(message.receiverId);
  if (!receiverId) {
    const err = new Error('Only direct messages can be marked read via this endpoint');
    err.statusCode = 403;
    throw err;
  }
  if (receiverId !== uid) {
    const err = new Error('Only the receiver can mark this message as read');
    err.statusCode = 403;
    throw err;
  }
  return true;
}

module.exports = {
  resolveParticipantId,
  assertCanAccessMessage,
  assertCanMarkMessageAsRead,
};
