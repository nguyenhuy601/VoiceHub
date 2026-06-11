const { getRedisClient } = require('@enterprise/shared');

const PREFIX = process.env.VOICE_LOBBY_BOOTSTRAP_PREFIX || 'vh:voice:lobby:bootstrap:';
const TTL_SEC = Math.max(60, parseInt(process.env.VOICE_LOBBY_BOOTSTRAP_TTL_SEC || '3600', 10) || 3600);

function keyFor(roomId) {
  return `${PREFIX}${String(roomId || '').trim()}`;
}

async function rememberLobbyBootstrap(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return false;

  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;

  try {
    const k = keyFor(rid);
    await redis.sadd(k, uid);
    await redis.expire(k, TTL_SEC);
    return true;
  } catch {
    return false;
  }
}

async function hasLobbyBootstrap(roomId, userId) {
  const rid = String(roomId || '').trim();
  const uid = String(userId || '').trim();
  if (!rid || !uid) return false;

  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return false;
  }
  if (!redis) return false;

  try {
    const score = await redis.sismember(keyFor(rid), uid);
    return score === 1;
  } catch {
    return false;
  }
}

module.exports = {
  rememberLobbyBootstrap,
  hasLobbyBootstrap,
};
