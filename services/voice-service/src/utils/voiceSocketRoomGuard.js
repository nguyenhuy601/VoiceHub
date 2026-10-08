const VOICE_ROOM_REQUIRED = 'VOICE_ROOM_REQUIRED';
const VOICE_ROOM_MISMATCH = 'VOICE_ROOM_MISMATCH';
const VOICE_FEATURE_FORBIDDEN = 'VOICE_FEATURE_FORBIDDEN';
const VOICE_RATE_LIMITED = 'VOICE_RATE_LIMITED';
const VOICE_AUTH_REQUIRED = 'VOICE_AUTH_REQUIRED';

function createVoiceSocketError(statusCode, errorCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

/** userId chỉ từ JWT socket. Không nhận socket.id. */
function resolveTrustedVoiceUserId(authUser) {
  const id = String(authUser?.id || authUser?.userId || authUser?._id || '').trim();
  return id || null;
}

/**
 * Event media/ghi âm/AI chỉ chạy trên phòng socket đã join.
 * payload.roomId trống → dùng phòng đã join; khác phòng → VOICE_ROOM_MISMATCH.
 */
function resolveJoinedRoom(socket, payloadRoomId) {
  const joined = String(socket?.data?.voiceRoomId || '').trim();
  if (!joined) {
    throw createVoiceSocketError(403, VOICE_ROOM_REQUIRED, 'Bạn chưa ở trong phòng');
  }
  const requested =
    payloadRoomId == null || payloadRoomId === '' ? '' : String(payloadRoomId).trim();
  if (requested && requested !== joined) {
    throw createVoiceSocketError(403, VOICE_ROOM_MISMATCH, 'Phòng không khớp phiên đang tham gia');
  }
  return joined;
}

function assertFeatureAllowed(allowed) {
  if (!allowed) {
    throw createVoiceSocketError(403, VOICE_FEATURE_FORBIDDEN, 'Không đủ quyền dùng tính năng này');
  }
}

function readPositiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function createJoinRateLimiter({
  max = readPositiveInt(process.env.VOICE_JOIN_RATE_MAX, 10),
  windowMs = readPositiveInt(process.env.VOICE_JOIN_RATE_WINDOW_MS, 10000),
  now = Date.now,
} = {}) {
  const hits = new Map();
  return function assertJoinRate(userId) {
    const key = String(userId || '').trim();
    if (!key) {
      throw createVoiceSocketError(401, VOICE_AUTH_REQUIRED, 'Phiên thoại không hợp lệ');
    }
    const t = now();
    const fresh = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
    if (fresh.length >= max) {
      hits.set(key, fresh);
      throw createVoiceSocketError(429, VOICE_RATE_LIMITED, 'Tham gia phòng quá nhanh, vui lòng thử lại');
    }
    fresh.push(t);
    hits.set(key, fresh);
  };
}

module.exports = {
  VOICE_ROOM_REQUIRED,
  VOICE_ROOM_MISMATCH,
  VOICE_FEATURE_FORBIDDEN,
  VOICE_RATE_LIMITED,
  VOICE_AUTH_REQUIRED,
  createVoiceSocketError,
  resolveTrustedVoiceUserId,
  resolveJoinedRoom,
  assertFeatureAllowed,
  createJoinRateLimiter,
};
