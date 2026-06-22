/**
 * S3 — config smoke: socket HA env + docker-stack defaults
 * node tests/s3-realtime-ha-config.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function envValue(file, key) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const m = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
}

const replicas = Number(envValue('.env', 'SOCKET_SERVICE_REPLICAS') || 0);
const adapter = envValue('.env', 'SOCKET_IO_REDIS_ADAPTER');
assert.ok(replicas >= 2, '.env SOCKET_SERVICE_REPLICAS must be >= 2');
assert.notStrictEqual(adapter, 'false');

const stack = fs.readFileSync(path.join(root, 'docker-stack.yml'), 'utf8');
assert.ok(stack.includes('SOCKET_IO_REDIS_ADAPTER=${SOCKET_IO_REDIS_ADAPTER:-true}'));
assert.ok(stack.includes('replicas: ${SOCKET_SERVICE_REPLICAS:-2}'));

const serverJs = fs.readFileSync(
  path.join(root, 'services', 'socket-service', 'src', 'server.js'),
  'utf8'
);
assert.ok(serverJs.includes('redisAdapterActive'));

assert.ok(fs.existsSync(path.join(root, 'devops', 'swarm', 'run-s3-validation.sh')));
assert.ok(fs.existsSync(path.join(root, 'devops', 'nginx', 'staging-swarm-edge.conf')));

console.log('s3-realtime-ha-config.smoke.js: OK');
