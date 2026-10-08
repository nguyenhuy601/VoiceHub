/**
 * WBS LLM response cache — Mongo durable + in-process inflight dedupe.
 * Key = sha256(model|numPredict|numCtx|prompt). Same input → reuse, no 2nd Ollama call.
 */

const crypto = require('crypto');
const {
  isWbsLlmJobMemoryStore,
} = require('../contracts/howWbsLlmQueueContract');

const CACHE_PREFIX = 'vh:ai-plan:wbs-llm:';
const memoryStore = new Map();
/** @type {Map<string, Promise<object|null>>} */
const inflight = new Map();

function isWbsLlmCacheEnabled(env = process.env) {
  const flag = String(env.HOW_WBS_LLM_CACHE ?? '1').trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(flag);
}

function resolveCacheTtlSec(env = process.env) {
  const n = Number(env.HOW_WBS_LLM_CACHE_TTL_SEC);
  if (Number.isFinite(n) && n >= 60) return Math.min(30 * 86400, Math.round(n));
  return 7 * 86400;
}

function buildWbsLlmCacheKey({
  prompt,
  model,
  numPredict,
  numCtx,
  shapeVersion = 'flat-v1',
}) {
  const raw = [
    shapeVersion,
    String(model || ''),
    String(numPredict || ''),
    String(numCtx || ''),
    String(prompt || ''),
  ].join('\n');
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function redisKey(hash) {
  return `${CACHE_PREFIX}${hash}`;
}

async function readRedis(hash, env = process.env) {
  // Memory job store = unit/integration without Redis side effects
  if (isWbsLlmJobMemoryStore(env)) return null;
  try {
    const { getRedisClient } = require('@enterprise/shared');
    const redis = getRedisClient && getRedisClient();
    if (!redis) return null;
    const raw = await redis.get(redisKey(hash));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.data == null) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeRedis(hash, payload, ttlSec, env = process.env) {
  if (isWbsLlmJobMemoryStore(env)) return false;
  try {
    const { getRedisClient } = require('@enterprise/shared');
    const redis = getRedisClient && getRedisClient();
    if (!redis) return false;
    await redis.set(redisKey(hash), JSON.stringify(payload), 'EX', ttlSec);
    return true;
  } catch {
    return false;
  }
}

async function readMongo(hash, env = process.env) {
  if (isWbsLlmJobMemoryStore(env)) {
    const hit = memoryStore.get(hash);
    if (!hit) return null;
    if (hit.expiresAt && Date.now() > hit.expiresAt) {
      memoryStore.delete(hash);
      return null;
    }
    return hit;
  }
  try {
    const WbsLlmChunkCache = require('./WbsLlmChunkCache.model');
    const doc = await WbsLlmChunkCache.findOne({
      cacheKey: hash,
      expiresAt: { $gt: new Date() },
    }).lean();
    if (!doc || doc.data == null) return null;
    return {
      data: doc.data,
      model: doc.model || null,
      usage: doc.usage || null,
      promptChars: doc.promptChars || null,
    };
  } catch {
    return null;
  }
}

async function writeMongo(hash, payload, ttlSec, env = process.env) {
  const expiresAt = Date.now() + ttlSec * 1000;
  if (isWbsLlmJobMemoryStore(env)) {
    memoryStore.set(hash, { ...payload, expiresAt });
    return true;
  }
  try {
    const WbsLlmChunkCache = require('./WbsLlmChunkCache.model');
    await WbsLlmChunkCache.findOneAndUpdate(
      { cacheKey: hash },
      {
        $set: {
          cacheKey: hash,
          data: payload.data,
          model: payload.model || null,
          usage: payload.usage || null,
          promptChars: payload.promptChars || null,
          expiresAt: new Date(expiresAt),
        },
      },
      { upsert: true, new: true }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<object|null>} cached ollama-shaped payload { data, model, usage, promptChars }
 */
async function getWbsLlmCachedResponse(hash, env = process.env) {
  if (!isWbsLlmCacheEnabled(env) || !hash) return null;
  const fromRedis = await readRedis(hash, env);
  if (fromRedis) return { ...fromRedis, cacheLayer: 'redis' };
  const fromMongo = await readMongo(hash, env);
  if (fromMongo) {
    // promote to redis
    const ttl = resolveCacheTtlSec(env);
    writeRedis(hash, fromMongo, ttl, env).catch(() => {});
    return { ...fromMongo, cacheLayer: 'mongo' };
  }
  return null;
}

async function setWbsLlmCachedResponse(hash, payload, env = process.env) {
  if (!isWbsLlmCacheEnabled(env) || !hash || !payload || payload.data == null) {
    return false;
  }
  const ttl = resolveCacheTtlSec(env);
  const body = {
    data: payload.data,
    model: payload.model || null,
    usage: payload.usage || null,
    promptChars: payload.promptChars || null,
  };
  await Promise.all([
    writeRedis(hash, body, ttl, env),
    writeMongo(hash, body, ttl, env),
  ]);
  return true;
}

/**
 * Single-flight: identical concurrent hash shares one producer.
 * @template T
 * @param {string} hash
 * @param {() => Promise<T>} producer
 * @returns {Promise<T>}
 */
async function withWbsLlmInflight(hash, producer) {
  const key = String(hash || '');
  if (!key) return producer();
  if (inflight.has(key)) return inflight.get(key);
  const p = Promise.resolve()
    .then(producer)
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

function resetWbsLlmCacheForTests() {
  memoryStore.clear();
  inflight.clear();
}

module.exports = {
  CACHE_PREFIX,
  isWbsLlmCacheEnabled,
  resolveCacheTtlSec,
  buildWbsLlmCacheKey,
  getWbsLlmCachedResponse,
  setWbsLlmCachedResponse,
  withWbsLlmInflight,
  resetWbsLlmCacheForTests,
};
