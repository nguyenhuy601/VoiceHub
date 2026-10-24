/**
 * Lazy client for redis-lg only. App Redis (auth / G15) is never used.
 */

const Redis = require('ioredis');

let client = null;
let clientUrl = null;

function artifactRedisUrl(env = process.env) {
  return String(env.LG_REDIS_URL || '').trim();
}

function getArtifactRedisClient(env = process.env) {
  const url = artifactRedisUrl(env);
  if (!url) return null;
  if (client && clientUrl === url) return client;
  if (client) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  client = new Redis(url, {
    maxRetriesPerRequest: 1,
    connectTimeout: 4000,
    enableOfflineQueue: false,
    lazyConnect: true,
  });
  client.on('error', (error) => {
    console.error('[artifact_store] redis', error?.code || '', error?.message || error);
  });
  clientUrl = url;
  return client;
}

async function runOnArtifactRedis(env, injected, fn) {
  if (injected) {
    try {
      return await fn(injected);
    } catch (err) {
      return { ok: false, reason: String(err?.message || err || 'redis_error') };
    }
  }
  const redis = getArtifactRedisClient(env);
  if (!redis) return { ok: false, reason: 'no_url' };
  try {
    if (typeof redis.connect === 'function' && redis.status === 'wait') {
      await redis.connect();
    }
    return await fn(redis);
  } catch (err) {
    return { ok: false, reason: String(err?.message || err || 'redis_error') };
  }
}

function resetArtifactRedisForTests() {
  if (client) {
    try {
      client.disconnect();
    } catch {
      /* ignore */
    }
  }
  client = null;
  clientUrl = null;
}

module.exports = {
  artifactRedisUrl,
  getArtifactRedisClient,
  runOnArtifactRedis,
  resetArtifactRedisForTests,
};
