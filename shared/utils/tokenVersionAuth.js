const { getRedisClient } = require('../config/redis');

const REDIS_PREFIX = 'token_version:';

/** Optional S2S fallback (gateway registers at startup). */
let tokenVersionResolver = null;

function setTokenVersionResolver(fn) {
  tokenVersionResolver = typeof fn === 'function' ? fn : null;
}

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
 * Resolve current tokenVersion: Redis first, then optional fallback (e.g. auth-service Mongo).
 * @returns {Promise<number|null>} null when version cannot be resolved (fail-closed)
 */
async function resolveCurrentTokenVersion(userId, resolveVersion) {
  const uid = String(userId || '').trim();
  if (!uid) return null;

  const resolver = resolveVersion || tokenVersionResolver;

  let redis;
  try {
    redis = getRedisClient();
  } catch {
    redis = null;
  }

  if (redis) {
    try {
      const current = await redis.get(tokenVersionRedisKey(uid));
      if (current !== null && current !== undefined) {
        return Number(current);
      }
    } catch {
      /* fall through to resolver */
    }
  }

  if (!resolver) return null;

  try {
    const resolved = await resolver(uid);
    if (resolved === null || resolved === undefined || Number.isNaN(Number(resolved))) {
      return null;
    }
    const version = Number(resolved);
    await cacheTokenVersion(uid, version);
    return version;
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<boolean>} false nếu token tv không khớp phiên hiện tại hoặc không resolve được version
 */
async function isAccessTokenVersionValid(userId, tokenTv, options = {}) {
  const uid = String(userId || '').trim();
  if (!uid) return false;

  const current = await resolveCurrentTokenVersion(uid, options.resolveVersion);
  if (current === null) return false;

  const got = Number(tokenTv ?? 0);
  return got === current;
}

module.exports = {
  cacheTokenVersion,
  isAccessTokenVersionValid,
  resolveCurrentTokenVersion,
  setTokenVersionResolver,
  tokenVersionRedisKey,
};
