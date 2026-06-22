/**
 * Redis connection profile — REDIS_URL → REDIS_SENTINELS → REDIS_HOST/PORT
 * Dùng chung cho ioredis (@enterprise/shared) và node-redis (socket adapter).
 */

function parseSentinelHosts(raw) {
  return String(raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.lastIndexOf(':');
      if (idx <= 0) return { host: entry, port: 26379 };
      return {
        host: entry.slice(0, idx).trim(),
        port: Number(entry.slice(idx + 1)) || 26379,
      };
    });
}

/**
 * @returns {{ mode: 'url'|'sentinel'|'host', url?: string, sentinels?: Array, name?: string, host?: string, port?: number, password?: string }}
 */
function resolveRedisConnectionProfile() {
  const password = String(process.env.REDIS_PASSWORD || '').trim() || undefined;
  const url = String(process.env.REDIS_URL || '').trim();
  if (url) {
    return { mode: 'url', url, password };
  }

  const sentinelsRaw = String(process.env.REDIS_SENTINELS || '').trim();
  if (sentinelsRaw) {
    const sentinels = parseSentinelHosts(sentinelsRaw);
    if (!sentinels.length) {
      throw new Error('REDIS_SENTINELS is set but no valid host:port entries found');
    }
    const name = String(process.env.REDIS_SENTINEL_NAME || 'mymaster').trim() || 'mymaster';
    if (!password) {
      throw new Error('REDIS_PASSWORD is required when REDIS_SENTINELS is set');
    }
    return { mode: 'sentinel', sentinels, name, password };
  }

  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT || 6379);
  const useAuth =
    String(process.env.REDIS_USE_AUTH || '').toLowerCase() === 'true' ||
    String(process.env.REDIS_USE_AUTH || '').toLowerCase() === '1';
  return {
    mode: 'host',
    host,
    port,
    password: useAuth && password ? password : undefined,
  };
}

const defaultIoredisRetry = (times) => Math.min(times * 50, 2000);

function buildIoredisOptions(overrides = {}) {
  const profile = resolveRedisConnectionProfile();
  const base = {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: defaultIoredisRetry,
    ...overrides,
  };

  if (profile.mode === 'url') {
    return { ...base, connectionUrl: profile.url };
  }
  if (profile.mode === 'sentinel') {
    return {
      ...base,
      sentinels: profile.sentinels,
      name: profile.name,
      password: profile.password,
      sentinelPassword: profile.password,
    };
  }
  return {
    ...base,
    host: profile.host,
    port: profile.port,
    ...(profile.password ? { password: profile.password } : {}),
  };
}

function buildNodeRedisReconnectStrategy() {
  return (retries) => {
    if (retries > 50) return new Error('Redis reconnect limit');
    return Math.min(retries * 50, 2000);
  };
}

/** Options cho `redis` package `createClient()` (v4 — không có createSentinel). */
function buildNodeRedisClientOptions(overrides = {}) {
  const profile = resolveRedisConnectionProfile();
  const socket = {
    reconnectStrategy: buildNodeRedisReconnectStrategy(),
    ...(overrides.socket || {}),
  };
  const { socket: _ignored, ...restOverrides } = overrides;

  if (profile.mode === 'url') {
    return { url: profile.url, socket, ...restOverrides };
  }
  if (profile.mode === 'sentinel') {
    // node-redis 4.x: adapter pub/sub kết nối thẳng master qua REDIS_HOST (Phase 1: redis-master).
    const host = String(process.env.REDIS_HOST || '').trim();
    if (!host) {
      throw new Error(
        'REDIS_HOST is required for node-redis when REDIS_SENTINELS is set (node-redis 4.x lacks createSentinel)'
      );
    }
    const port = Number(process.env.REDIS_PORT || 6379);
    let url = `redis://${host}:${port}`;
    if (profile.password) {
      url = `redis://:${encodeURIComponent(profile.password)}@${host}:${port}`;
    }
    return { url, socket, ...restOverrides };
  }

  let url = `redis://${profile.host}:${profile.port}`;
  if (profile.password) {
    url = `redis://:${encodeURIComponent(profile.password)}@${profile.host}:${profile.port}`;
  }
  return { url, socket, ...restOverrides };
}

function describeRedisConnectionMode() {
  const p = resolveRedisConnectionProfile();
  if (p.mode === 'url') return 'url';
  if (p.mode === 'sentinel') return `sentinel:${p.name}`;
  return `host:${p.host}:${p.port}`;
}

module.exports = {
  parseSentinelHosts,
  resolveRedisConnectionProfile,
  buildIoredisOptions,
  buildNodeRedisClientOptions,
  describeRedisConnectionMode,
};
