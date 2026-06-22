/**
 * P1-Redis-A — Sentinel stack file smoke
 * node tests/redis-sentinel-stack.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const base = path.join(root, 'devops/swarm/redis-sentinel');
const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8');

const compose = read('docker-compose.sentinel.yml');
const readme = read('README.md');

const requiredFiles = [
  'docker-compose.sentinel.yml',
  'docker-compose.sentinel.local.yml',
  'README.md',
  'config/redis-master.conf',
  'scripts/redis-master-entrypoint.sh',
  'scripts/redis-replica-entrypoint.sh',
  'scripts/sentinel-entrypoint.sh',
  'deploy-sentinel-stack.sh',
  'run-sentinel-failover-test.sh',
];

for (const f of requiredFiles) {
  assert.ok(fs.existsSync(path.join(base, f)), `missing ${f}`);
}

assert.ok(compose.includes('redis-master'));
assert.ok(compose.includes('redis-replica-1'));
assert.ok(compose.includes('redis-replica-2'));
assert.ok(compose.includes('redis-sentinel-1'));
assert.ok(compose.includes('redis-sentinel-2'));
assert.ok(compose.includes('redis-sentinel-3'));
assert.ok(compose.includes('REDIS_PASSWORD'));
assert.ok(compose.includes('spread: node.id'));
assert.ok(!compose.match(/^\s*ports:/m), 'must not publish host ports');

const masterConf = read('config/redis-master.conf');
assert.ok(masterConf.includes('appendonly yes'));

const replicaSh = read('scripts/redis-replica-entrypoint.sh');
assert.ok(replicaSh.includes('masterauth') || replicaSh.includes('--masterauth'));
assert.ok(replicaSh.includes('requirepass') || replicaSh.includes('--requirepass'));

const sentinelSh = read('scripts/sentinel-entrypoint.sh');
assert.ok(sentinelSh.includes('sentinel monitor'));
assert.ok(sentinelSh.includes('sentinel auth-pass'));

assert.ok(readme.includes('REDIS_SENTINELS'));
assert.ok(readme.includes('mymaster'));
assert.ok(readme.includes('6379'));

console.log('redis-sentinel-stack.smoke.js: OK');
