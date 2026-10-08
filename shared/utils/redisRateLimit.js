const { getRedisClient } = require('../config/redis');
const logger = require('./logger');

const FAIL_OPEN_LOG_MS = 60_000;
const failOpenLogState = { lastAt: 0 };

/**
 * Nhánh đếm được không có failOpen. Nhánh không có client hoặc INCR lỗi giữ allowed: true và gắn failOpen.
 * @param {{ redisAvailable: boolean, incrThrew: boolean, count?: number, limit?: number }} input
 * @returns {{ allowed: boolean, remaining: number, failOpen?: boolean }}
 */
function decideRateLimitOutcome({ redisAvailable, incrThrew, count, limit }) {
  const max = Math.max(1, Number(limit) || 10);
  if (!redisAvailable || incrThrew) {
    return { allowed: true, remaining: max, failOpen: true };
  }
  const n = Number(count) || 0;
  return { allowed: n <= max, remaining: Math.max(0, max - n) };
}

/**
 * Tối đa một cảnh báo mỗi 60 giây. Payload chỉ có reason, không có key.
 * @returns {boolean} true khi vừa ghi log
 */
function logRedisUnavailable(log = logger, now = Date.now(), state = failOpenLogState) {
  if (now - state.lastAt < FAIL_OPEN_LOG_MS) return false;
  state.lastAt = now;
  log.warn('redis_unavailable', { reason: 'redis_unavailable' });
  return true;
}

function failOpenResult(max) {
  logRedisUnavailable();
  return decideRateLimitOutcome({
    redisAvailable: false,
    incrThrew: false,
    limit: max,
  });
}

/**
 * Sliding-window rate limit đơn giản (Redis INCR + EXPIRE).
 * Key rỗng: allowed, không gắn failOpen (không phải Redis chết).
 * @returns {Promise<{ allowed: boolean, remaining: number, failOpen?: boolean }>}
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
    return failOpenResult(max);
  }
  if (!redis) return failOpenResult(max);

  try {
    const count = await redis.incr(k);
    if (count === 1) {
      await redis.expire(k, ttl);
    }
    return decideRateLimitOutcome({
      redisAvailable: true,
      incrThrew: false,
      count,
      limit: max,
    });
  } catch {
    return failOpenResult(max);
  }
}

module.exports = {
  checkRateLimit,
  decideRateLimitOutcome,
  logRedisUnavailable,
};
