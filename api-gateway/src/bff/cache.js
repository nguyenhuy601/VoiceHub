const Redis = require('ioredis');
const { buildIoredisOptions, describeRedisConnectionMode } = require('@enterprise/shared/config/redisConnection');

let redisClient = null;

function isCacheEnabled() {
  const raw = String(process.env.BFF_CACHE_ENABLED || 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function connectBffRedis() {
  if (redisClient || !isCacheEnabled()) return redisClient;
  try {
    const opts = buildIoredisOptions({
      maxRetriesPerRequest: 2,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 100, 2000)),
    });
    const { connectionUrl, ...rest } = opts;
    redisClient = connectionUrl ? new Redis(connectionUrl, rest) : new Redis(rest);
    console.log(`[bff:cache] Redis mode ${describeRedisConnectionMode()}`);
    redisClient.on('error', (err) => {
      console.warn('[bff:cache] Redis error:', err.message);
    });
    redisClient.on('connect', () => {
      console.log('[bff:cache] Redis connected');
    });
  } catch (err) {
    console.warn('[bff:cache] Redis init failed:', err.message);
    redisClient = null;
  }
  return redisClient;
}

function getRedis() {
  if (!isCacheEnabled()) return null;
  if (!redisClient) connectBffRedis();
  return redisClient;
}

async function getCachedJson(key) {
  const redis = getRedis();
  if (!redis || !key) return null;
  try {
    const raw = await redis.get(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function setCachedJson(key, value, ttlSec) {
  const redis = getRedis();
  if (!redis || !key) return;
  try {
    const ttl = Math.max(5, Number(ttlSec) || 60);
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch (err) {
    console.warn('[bff:cache] set failed', key, err.message);
  }
}

function bootstrapCacheKey(userId, suite = '') {
  const uid = String(userId || '').trim();
  const s = String(suite || '').trim().toLowerCase();
  return s ? `bff:bootstrap:${uid}:${s}` : `bff:bootstrap:${uid}:default`;
}

function shellCacheKey(userId, orgId) {
  return `bff:shell:${String(userId || '').trim()}:${String(orgId || '').trim()}`;
}

function documentsOverviewCacheKey(userId, orgId) {
  return `bff:documents-overview:${String(userId || '').trim()}:${String(orgId || '').trim()}`;
}

function dashboardSummaryCacheKey(userId) {
  return `bff:dashboard-summary:v4:${String(userId || '').trim()}`;
}

module.exports = {
  connectBffRedis,
  getCachedJson,
  setCachedJson,
  bootstrapCacheKey,
  shellCacheKey,
  documentsOverviewCacheKey,
  dashboardSummaryCacheKey,
  isCacheEnabled,
};
