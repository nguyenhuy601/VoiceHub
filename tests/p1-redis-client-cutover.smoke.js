/**
 * P1-Redis-B — client cutover smoke
 * node tests/p1-redis-client-cutover.smoke.js
 * PHASE1_REDIS_LIVE=1 — reconnect sau Sentinel failover
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const redisJs = read('shared/config/redis.js');
const connJs = read('shared/config/redisConnection.js');
const socketJs = read('services/socket-service/src/server.js');
const bffCache = read('api-gateway/src/bff/cache.js');

assert.ok(connJs.includes('REDIS_URL'));
assert.ok(connJs.includes('REDIS_SENTINELS'));
assert.ok(connJs.includes('REDIS_SENTINEL_NAME'));
assert.ok(connJs.includes('buildNodeRedisClientOptions'));
assert.ok(connJs.includes('sentinelPassword'));

assert.ok(redisJs.includes('buildIoredisOptions'));
assert.ok(redisJs.includes('Sentinel'));

assert.ok(socketJs.includes('buildNodeRedisClientOptions'));
assert.ok(socketJs.includes('@enterprise/shared/config/redisConnection'));
assert.ok(!socketJs.includes('redis://${process.env.REDIS_HOST}'));

assert.ok(bffCache.includes('buildIoredisOptions'));

const { resolveRedisConnectionProfile, parseSentinelHosts } = require('../shared/config/redisConnection');

const envKeys = [
  'REDIS_URL',
  'REDIS_SENTINELS',
  'REDIS_SENTINEL_NAME',
  'REDIS_PASSWORD',
  'REDIS_USE_AUTH',
  'REDIS_HOST',
  'REDIS_PORT',
];
const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

function restoreEnv() {
  for (const k of envKeys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

try {
  for (const k of envKeys) delete process.env[k];
  process.env.REDIS_HOST = 'redis';
  process.env.REDIS_PORT = '6379';
  const hostProfile = resolveRedisConnectionProfile();
  assert.strictEqual(hostProfile.mode, 'host');
  assert.strictEqual(hostProfile.host, 'redis');

  process.env.REDIS_URL = 'redis://:secret@redis-master:6379';
  delete process.env.REDIS_HOST;
  const urlProfile = resolveRedisConnectionProfile();
  assert.strictEqual(urlProfile.mode, 'url');

  delete process.env.REDIS_URL;
  process.env.REDIS_SENTINELS = 'redis-sentinel-1:26379,redis-sentinel-2:26379';
  process.env.REDIS_SENTINEL_NAME = 'mymaster';
  process.env.REDIS_PASSWORD = 'testpass';
  process.env.REDIS_HOST = 'redis-master';
  process.env.REDIS_PORT = '6379';
  const sentProfile = resolveRedisConnectionProfile();
  assert.strictEqual(sentProfile.mode, 'sentinel');
  assert.strictEqual(sentProfile.name, 'mymaster');
  assert.strictEqual(parseSentinelHosts('a:1,b:2').length, 2);

  const nodeOpts = require('../shared/config/redisConnection').buildNodeRedisClientOptions();
  assert.ok(nodeOpts.url, 'node-redis v4 uses master URL when REDIS_SENTINELS set');
  assert.ok(nodeOpts.url.includes('redis-master'));
  assert.ok(nodeOpts.url.includes('testpass'));
} finally {
  restoreEnv();
}

if (process.env.PHASE1_REDIS_LIVE === '1') {
  require('child_process').execSync('bash devops/swarm/redis-sentinel/run-redis-client-failover-chaos.sh', {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, CHAOS_DRY_RUN: process.env.CHAOS_DRY_RUN || '0' },
  });
}

console.log('p1-redis-client-cutover.smoke.js: OK');
