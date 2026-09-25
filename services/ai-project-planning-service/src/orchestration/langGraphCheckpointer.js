/**
 * Agent Core F2 — LangGraph checkpointer factory.
 * Prefer RedisSaver (pod-safe); MemorySaver for tests / Redis down.
 * Product AgentState SoT remains G15 via onCheckpoint (dual-write).
 */

const { MemorySaver } = require('@langchain/langgraph');

let cachedRedis = null;
let cachedRedisUrl = null;

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
 * @param {{ env?: NodeJS.ProcessEnv, forceMemory?: boolean }} [opts]
 * @returns {Promise<{ checkpointer: object, kind: 'redis'|'memory' }>}
 */
async function getLangGraphCheckpointer(opts = {}) {
  const env = opts.env || process.env;
  if (opts.forceMemory || preferMemory(env)) {
    return { checkpointer: new MemorySaver(), kind: 'memory' };
  }

  try {
    const { RedisSaver } = require('@langchain/langgraph-checkpoint-redis');
    const url = redisUrlFromEnv(env);
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
}

module.exports = {
  getLangGraphCheckpointer,
  redisUrlFromEnv,
  _resetLangGraphCheckpointerCacheForTests,
};
