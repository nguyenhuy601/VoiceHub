/**
 * Agent Core F2 — LangGraph checkpointer factory.
 * Prefer RedisSaver only when Redis has RedisJSON (JSON.SET).
 * Plain redis:7-alpine → MemorySaver (G15 onCheckpoint remains SoT).
 */

const { MemorySaver } = require('@langchain/langgraph');

let cachedRedis = null;
let cachedRedisUrl = null;
let cachedProbe = null;

function redisUrlFromEnv(env = process.env) {
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
    const saver = await RedisSaver.fromUrl(url);
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
  _resetLangGraphCheckpointerCacheForTests,
};
