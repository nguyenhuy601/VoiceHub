/**
 * Redis: user đang xem đúng room Project Chat (skip Inbox mention).
 * Key: vh:project_room_focus:{userId}:{roomId}
 */
const { getRedisClient } = require('@enterprise/shared');

const PREFIX = process.env.PROJECT_ROOM_FOCUS_REDIS_PREFIX || 'vh:project_room_focus:';
const ACTIVE_PREFIX =
  process.env.PROJECT_ROOM_FOCUS_ACTIVE_REDIS_PREFIX || 'vh:project_room_focus_active:';
const TTL_SEC = Math.max(30, parseInt(process.env.PROJECT_ROOM_FOCUS_TTL_SEC || '90', 10) || 90);

function focusKey(userId, roomId) {
  return `${PREFIX}${String(userId)}:${String(roomId)}`;
}

function activeKey(userId) {
  return `${ACTIVE_PREFIX}${String(userId)}`;
}

async function setActive(userId, roomId) {
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
    const prev = await redis.get(activeKey(uid));
    if (prev && prev !== rid) {
      await redis.del(focusKey(uid, prev));
    }
    await redis.setex(focusKey(uid, rid), TTL_SEC, '1');
    await redis.setex(activeKey(uid), TTL_SEC, rid);
    return true;
  } catch (e) {
    console.warn('[projectRoomFocus:redis] setActive failed', e.message);
    return false;
  }
}

async function refreshTtl(userId, roomId) {
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
    const fk = focusKey(uid, rid);
    const exists = await redis.exists(fk);
    if (exists) {
      await redis.expire(fk, TTL_SEC);
      await redis.expire(activeKey(uid), TTL_SEC);
    }
    return true;
  } catch {
    return false;
  }
}

async function clear(userId, roomId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;
  try {
    const rid = String(roomId || '').trim() || (await redis.get(activeKey(uid)));
    if (rid) await redis.del(focusKey(uid, rid));
    await redis.del(activeKey(uid));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  setActive,
  refreshTtl,
  clear,
  focusKey,
  TTL_SEC,
};
