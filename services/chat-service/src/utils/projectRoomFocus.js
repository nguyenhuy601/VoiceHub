const { getRedisClient } = require('@enterprise/shared');

const PREFIX = process.env.PROJECT_ROOM_FOCUS_REDIS_PREFIX || 'vh:project_room_focus:';

function keyFor(userId, roomId) {
  return `${PREFIX}${String(userId)}:${String(roomId)}`;
}

/** True nếu user đang mở đúng Project Chat room (heartbeat từ client). */
async function isFocusedOnProjectRoom(userId, roomId) {
  const uid = String(userId || '').trim();
  const rid = String(roomId || '').trim();
  if (!uid || !rid) return false;
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    const v = await redis.get(keyFor(uid, rid));
    return v === '1';
  } catch {
    return false;
  }
}

module.exports = { isFocusedOnProjectRoom };
