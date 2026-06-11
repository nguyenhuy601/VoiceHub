const { getRedisClient } = require('../config/redis');

const REDIS_PREFIX = 'token_version:';

function tokenVersionRedisKey(userId) {
  return `${REDIS_PREFIX}${String(userId || '').trim()}`;
}

async function cacheTokenVersion(userId, version) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return;
  }
  if (!redis) return;
  try {
    await redis.set(tokenVersionRedisKey(uid), String(Number(version) || 0));
  } catch {
    /* best-effort */
  }
}

/**
 * @returns {Promise<boolean>} false nếu token tv không khớp phiên hiện tại
 */
async function isAccessTokenVersionValid(userId, tokenTv) {
  const uid = String(userId || '').trim();
  if (!uid) return false;

  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return true;
  }
  if (!redis) return true;

  try {
    const current = await redis.get(tokenVersionRedisKey(uid));
    if (current === null || current === undefined) return true;
    const expected = Number(current);
    const got = Number(tokenTv ?? 0);
    return got === expected;
  } catch {
    return true;
  }
}

module.exports = {
  cacheTokenVersion,
  isAccessTokenVersionValid,
  tokenVersionRedisKey,
};
