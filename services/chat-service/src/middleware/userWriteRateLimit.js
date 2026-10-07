const { sendServiceError } = require('./sendServiceError');

const DEFAULT_WINDOW_MS = 60 * 1000;
const DEFAULT_MESSAGE_MAX = 60;
const DEFAULT_REACTION_MAX = 120;
const FALLBACK_WARN_INTERVAL_MS = 60 * 1000;

function readPositiveInt(raw, fallback) {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function defaultGetRedis() {
  const { getRedisClient } = require('@enterprise/shared');
  return getRedisClient();
}

/**
 * Fixed-window rate limit theo userId đã xác thực (mount sau `authenticate`).
 * Redis là nguồn chính; Redis lỗi/không có → đếm in-memory (không fail-open).
 */
function createUserWriteRateLimiter({
  bucket,
  max,
  windowMs = DEFAULT_WINDOW_MS,
  getRedis = defaultGetRedis,
  now = Date.now,
} = {}) {
  const memory = new Map();
  let lastFallbackWarnAt = 0;

  function warnFallback() {
    const ts = now();
    if (ts - lastFallbackWarnAt < FALLBACK_WARN_INTERVAL_MS) return;
    lastFallbackWarnAt = ts;
    console.warn('[chat] rate limit redis fallback', { bucket });
  }

  function countInMemory(key, windowEnd) {
    const ts = now();
    for (const [k, entry] of memory) {
      if (entry.expiresAt <= ts) memory.delete(k);
    }
    const entry = memory.get(key) || { count: 0, expiresAt: windowEnd };
    entry.count += 1;
    memory.set(key, entry);
    return entry.count;
  }

  async function countHit(key, windowEnd) {
    let redis = null;
    try {
      redis = getRedis();
    } catch {
      redis = null;
    }
    if (!redis) return countInMemory(key, windowEnd);
    try {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, windowMs);
      return count;
    } catch {
      warnFallback();
      return countInMemory(key, windowEnd);
    }
  }

  return async function userWriteRateLimit(req, res, next) {
    const userId = String(req.user?.id || req.user?._id || '').trim();
    if (!userId) return next();

    const ts = now();
    const windowIndex = Math.floor(ts / windowMs);
    const windowEnd = (windowIndex + 1) * windowMs;
    const key = `chat:rl:${bucket}:${userId}:${windowIndex}`;
    const count = await countHit(key, windowEnd);
    if (count <= max) return next();

    res.set('Retry-After', String(Math.max(1, Math.ceil((windowEnd - ts) / 1000))));
    return sendServiceError(res, 429, {
      errorCode: 'CHAT_RATE_LIMITED',
      messageUser: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít giây.',
      message: 'Too many requests',
    });
  };
}

const windowMs = readPositiveInt(process.env.CHAT_RATE_WINDOW_MS, DEFAULT_WINDOW_MS);

const messageWriteLimiter = createUserWriteRateLimiter({
  bucket: 'message',
  max: readPositiveInt(process.env.CHAT_MESSAGE_RATE_MAX, DEFAULT_MESSAGE_MAX),
  windowMs,
});

const reactionWriteLimiter = createUserWriteRateLimiter({
  bucket: 'reaction',
  max: readPositiveInt(process.env.CHAT_REACTION_RATE_MAX, DEFAULT_REACTION_MAX),
  windowMs,
});

const voteWriteLimiter = createUserWriteRateLimiter({
  bucket: 'vote',
  max: readPositiveInt(process.env.CHAT_VOTE_RATE_MAX, DEFAULT_REACTION_MAX),
  windowMs,
});

module.exports = {
  createUserWriteRateLimiter,
  messageWriteLimiter,
  reactionWriteLimiter,
  voteWriteLimiter,
};
