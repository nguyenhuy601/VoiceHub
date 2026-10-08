const MAX_MESSAGE_CONTENT = 20000;
const MAX_SEARCH_QUERY = 200;
const MAX_PAGE = 500;
const MAX_EMOJI_LENGTH = 32;
const MAX_REACTIONS_PER_USER = 20;
const MAX_MENTION_IDS = 50;
const USER_MESSAGE_TYPES = Object.freeze(['text', 'image', 'file', 'business_card']);
/** Topic kênh vẫn `system`; poll mới dùng `poll`. Cả hai chỉ room, không DM. */
const ROOM_ONLY_USER_MESSAGE_TYPES = Object.freeze(['system', 'poll']);

function isUserMessageTypeAllowed(messageType, { isRoom }) {
  if (USER_MESSAGE_TYPES.includes(messageType)) return true;
  return Boolean(isRoom) && ROOM_ONLY_USER_MESSAGE_TYPES.includes(messageType);
}

const INVALID_ID_MESSAGE = 'Mã tin nhắn không hợp lệ';
const INTERNAL_ERROR_CODE = 'CHAT_INTERNAL_ERROR';

function createChatError(statusCode, errorCode, messageUser) {
  const err = new Error(messageUser);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  err.messageUser = messageUser;
  return err;
}

function isInvalidIdError(err) {
  const name = String(err?.name || '');
  return name === 'CastError' || name === 'BSONError' || name === 'BSONTypeError';
}

/**
 * Chuẩn hóa lỗi service trước khi lên controller: giữ lỗi nghiệp vụ (có statusCode),
 * id sai → 400, còn lại 500 không nhúng message gốc (tránh lộ host/driver).
 * `cause` giữ lỗi gốc cho nhánh cần phân biệt (vd. duplicate key) — không trả client.
 */
function toChatError(err) {
  if (Number(err?.statusCode) >= 400) return err;
  if (isDuplicateKeyError(err)) {
    // projectChatEventsConsumer nhận diện race qua /duplicate/i trên message.
    const mapped = createChatError(409, 'CHAT_DUPLICATE', 'Duplicate message');
    mapped.cause = err;
    return mapped;
  }
  if (isInvalidIdError(err)) {
    const mapped = createChatError(400, 'CHAT_INVALID_ID', INVALID_ID_MESSAGE);
    mapped.cause = err;
    return mapped;
  }
  const mapped = new Error('Chat service error');
  mapped.statusCode = 500;
  mapped.errorCode = INTERNAL_ERROR_CODE;
  mapped.cause = err;
  return mapped;
}

function isDuplicateKeyError(err) {
  const src = err?.cause || err;
  return Number(src?.code) === 11000 || /duplicate|E11000/i.test(String(src?.message || ''));
}

module.exports = {
  MAX_MESSAGE_CONTENT,
  MAX_SEARCH_QUERY,
  MAX_PAGE,
  MAX_EMOJI_LENGTH,
  MAX_REACTIONS_PER_USER,
  MAX_MENTION_IDS,
  USER_MESSAGE_TYPES,
  ROOM_ONLY_USER_MESSAGE_TYPES,
  isUserMessageTypeAllowed,
  INVALID_ID_MESSAGE,
  INTERNAL_ERROR_CODE,
  createChatError,
  toChatError,
  isDuplicateKeyError,
};
