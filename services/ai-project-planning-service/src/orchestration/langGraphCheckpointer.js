/**
 * Agent Core F2 — LangGraph checkpointer factory.
 * Prefer RedisSaver only when Redis has RedisJSON (JSON.SET).
 * Plain redis:7-alpine → MemorySaver (G15 onCheckpoint remains SoT).
 * No Postgres — Hybrid HITL durable path is Redis+RedisJSON only.
 * When AGENT_CORE_HITL_INTERRUPT=1, callers must assertDurableCheckpointerForInRunHitl.
 */

const { MemorySaver } = require('@langchain/langgraph');

let cachedRedis = null;
let cachedRedisUrl = null;
let cachedProbe = null;

/** Minutes. RedisSaver stores seconds as defaultTTL * 60. Drops abandoned checkpoints. */
const CHECKPOINT_TTL_MINUTES = 60 * 24 * 7;

/**
 * node-redis crashes the process when 'error' has no listener.
 * A dropped socket (ECONNRESET) during checkpoint then leaves HOW stuck on plan/select.
 * @param {{ client?: { on?: Function } }} saver
 */
function bindRedisSaverErrorHandler(saver) {
  const client = saver?.client;
  if (!client || typeof client.on !== 'function' || client.__vhErrorBound) return;
  client.__vhErrorBound = true;
  client.on('error', (error) => {
    console.error(
      '[agent_core] redis checkpointer socket',
      error?.code || '',
      error?.message || error
    );
    if (cachedRedis === saver) {
      cachedRedis = null;
      cachedRedisUrl = null;
    }
  });
}

/**
 * Prefer dedicated LangGraph Redis Stack (RedisJSON) over app Redis alpine.
 * LG_REDIS_URL / AGENT_CORE_LG_REDIS_URL — ví dụ redis://redis-lg:6379
 */
function redisUrlFromEnv(env = process.env) {
  const lg =
    String(env.LG_REDIS_URL || env.AGENT_CORE_LG_REDIS_URL || '').trim();
  if (lg) return lg;
  const explicit = String(env.REDIS_URL || '').trim();
  if (explicit) return explicit;
  const host = String(env.REDIS_HOST || '127.0.0.1').trim() || '127.0.0.1';
  const port = String(env.REDIS_PORT || '6379').trim() || '6379';
  const pass = String(env.REDIS_PASSWORD || '').trim();
  const useAuth =
    String(env.REDIS_USE_AUTH || '').trim().toLowerCase() === 'true' ||
    String(env.REDIS_USE_AUTH || '').trim() === '1';
  if (pass && useAuth) {
    return `redis://:${encodeURIComponent(pass)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

function preferMemory(env = process.env) {
  const raw = String(env.AGENT_CORE_LG_MEMORY ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'on';
}

/**
 * Swarm uses redis:7-alpine without RedisJSON/RediSearch.
 * RedisSaver needs JSON.SET — probe before adopting it.
 */
async function probeRedisJsonSupport(url) {
  if (cachedProbe && cachedProbe.url === url) return cachedProbe.ok;
  const Redis = require('ioredis');
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 4000,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  let ok = false;
  try {
    await client.connect();
    const key = `__vh_lg_json_probe_${Date.now()}`;
    await client.call('JSON.SET', key, '$', '"ok"');
    await client.call('JSON.DEL', key);
    ok = true;
  } catch {
    ok = false;
  } finally {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  cachedProbe = { url, ok };
  return ok;
}

/**
 * @param {{ env?: NodeJS.ProcessEnv, forceMemory?: boolean }} [opts]
 * @returns {Promise<{ checkpointer: object, kind: 'redis'|'memory' }>}
 */
async function getLangGraphCheckpointer(opts = {}) {
  const env = opts.env || process.env;
  if (opts.forceMemory || preferMemory(env)) {
    console.info('[agent_core] checkpointer=memory (AGENT_CORE_LG_MEMORY or force)');
    return { checkpointer: new MemorySaver(), kind: 'memory' };
  }

  try {
    const url = redisUrlFromEnv(env);
    const jsonOk = await probeRedisJsonSupport(url);
    if (!jsonOk) {
      console.warn(
        '[agent_core] Redis lacks RedisJSON (JSON.SET) — using MemorySaver; set AGENT_CORE_LG_MEMORY=1 to silence'
      );
      return { checkpointer: new MemorySaver(), kind: 'memory' };
    }

    const { RedisSaver } = require('@langchain/langgraph-checkpoint-redis');
    if (cachedRedis && cachedRedisUrl === url) {
      return { checkpointer: cachedRedis, kind: 'redis' };
    }
    const saver = await RedisSaver.fromUrl(url, {
      defaultTTL: CHECKPOINT_TTL_MINUTES,
      refreshOnRead: true,
    });
    bindRedisSaverErrorHandler(saver);
    cachedRedis = saver;
    cachedRedisUrl = url;
    console.info('[agent_core] checkpointer=redis');
    return { checkpointer: saver, kind: 'redis' };
  } catch (error) {
    console.warn(
      '[agent_core] RedisSaver unavailable, MemorySaver:',
      error?.message || error
    );
    return { checkpointer: new MemorySaver(), kind: 'memory' };
  }
}

/** Test helper — drop cached Redis saver */
function _resetLangGraphCheckpointerCacheForTests() {
  cachedRedis = null;
  cachedRedisUrl = null;
  cachedProbe = null;
}

module.exports = {
  getLangGraphCheckpointer,
  redisUrlFromEnv,
  probeRedisJsonSupport,
  preferMemory,
  bindRedisSaverErrorHandler,
  CHECKPOINT_TTL_MINUTES,
  _resetLangGraphCheckpointerCacheForTests,
};
