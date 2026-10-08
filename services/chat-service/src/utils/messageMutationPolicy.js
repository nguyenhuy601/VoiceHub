/**
 * Quyết định quyền xóa/sửa tin kênh tổ chức (thuần, không I/O).
 * Người gửi xóa tin của mình chỉ cần canRead; moderator (không phải người gửi) cần canDelete.
 */
const DELETE_ACCESS = Object.freeze({ SENDER: 'sender', MODERATOR: 'moderator' });

function isOrgRoomMessage(message) {
  return Boolean(message?.organizationId && message?.roomId);
}

function resolveRoomDeleteAccess({ isSender, perms } = {}) {
  const p = perms || {};
  if (isSender) return p.canRead ? DELETE_ACCESS.SENDER : null;
  return p.canDelete ? DELETE_ACCESS.MODERATOR : null;
}

function buildDeleteFilter({ messageId, userId, asModerator = false }) {
  const filter = { _id: messageId, isDeleted: { $ne: true } };
  if (!asModerator) filter.senderId = userId;
  return filter;
}

module.exports = {
  DELETE_ACCESS,
  isOrgRoomMessage,
  resolveRoomDeleteAccess,
  buildDeleteFilter,
};
