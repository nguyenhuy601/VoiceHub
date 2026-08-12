const MAX_DM_CONTENT_LEN = Math.max(500, Number(process.env.SOCKET_DM_MAX_CONTENT_LEN || 8000));
const ALLOWED_DM_TYPES = new Set(['text', 'image', 'file', 'audio', 'video', 'system']);

function isValidObjectIdLike(value) {
  return /^[a-fA-F0-9]{24}$/.test(String(value || '').trim());
}

function validateFriendSendPayload({ receiverId, content, messageType, replyToMessageId }) {
  const rid = String(receiverId || '').trim();
  if (!rid || !isValidObjectIdLike(rid)) {
    return { ok: false, message: 'receiverId không hợp lệ' };
  }
  const text = String(content ?? '');
  if (!text.trim()) {
    return { ok: false, message: 'content is required' };
  }
  if (text.length > MAX_DM_CONTENT_LEN) {
    return { ok: false, message: 'Nội dung tin nhắn quá dài' };
  }
  const type = String(messageType || 'text').trim().toLowerCase();
  if (!ALLOWED_DM_TYPES.has(type)) {
    return { ok: false, message: 'messageType không hợp lệ' };
  }
  if (replyToMessageId && !isValidObjectIdLike(replyToMessageId)) {
    return { ok: false, message: 'replyToMessageId không hợp lệ' };
  }
  return { ok: true };
}

module.exports = {
  validateFriendSendPayload,
  MAX_DM_CONTENT_LEN,
};
