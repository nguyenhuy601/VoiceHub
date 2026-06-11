const { getRedisClient } = require('../config/redis');

/**
 * Sliding-window rate limit đơn giản (Redis INCR + EXPIRE).
 * @returns {Promise<{ allowed: boolean, remaining: number }>}
 */
async function checkRateLimit({ key, limit, windowSec }) {
  const k = String(key || '').trim();
  const max = Math.max(1, Number(limit) || 10);
  const ttl = Math.max(1, Number(windowSec) || 60);
  if (!k) return { allowed: true, remaining: max };

  let redis;
  try {
    redis = getRedisClient();
  } catch {
    return { allowed: true, remaining: max };
  }
  if (!redis) return { allowed: true, remaining: max };

  try {
    const count = await redis.incr(k);
    if (count === 1) {
      await redis.expire(k, ttl);
    }
    return { allowed: count <= max, remaining: Math.max(0, max - count) };
  } catch {
    return { allowed: true, remaining: max };
  }
}

module.exports = { checkRateLimit };
