/**
 * P1-Rabbit-A — RabbitMQ cluster stack smoke
 * node tests/rabbitmq-cluster-stack.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const base = path.join(root, 'devops/swarm/rabbitmq-cluster');
const read = (rel) => fs.readFileSync(path.join(base, rel), 'utf8');

const required = [
  'docker-compose.cluster.yml',
  'docker-compose.cluster.local.yml',
  'README.md',
  'scripts/rabbitmq-cluster-entrypoint.sh',
  'deploy-cluster-stack.sh',
  'run-cluster-node-kill-test.sh',
];

for (const f of required) {
  assert.ok(fs.existsSync(path.join(base, f)), `missing ${f}`);
}

const compose = read('docker-compose.cluster.yml');
const readme = read('README.md');
const entry = read('scripts/rabbitmq-cluster-entrypoint.sh');

assert.ok(compose.includes('rabbitmq-1'));
assert.ok(compose.includes('rabbitmq-2'));
assert.ok(compose.includes('rabbitmq-3'));
assert.ok(compose.includes('RABBITMQ_ERLANG_COOKIE'));
assert.ok(compose.includes('spread: node.id'));
assert.ok(!compose.match(/^\s*ports:/m), 'must not publish host ports');

assert.ok(entry.includes('join_cluster'));
assert.ok(entry.includes('RABBITMQ_CLUSTER_ROLE'));

assert.ok(readme.includes('RABBITMQ_URL'));
assert.ok(readme.includes('rabbitmq-1:5672'));
assert.ok(readme.includes('reconnect'));
assert.ok(readme.includes('15672'));
assert.ok(readme.includes('overlay'));

const envText = fs.readFileSync(path.join(root, '.env'), 'utf8');
assert.ok(/^RABBITMQ_ERLANG_COOKIE=/m.test(envText), '.env needs RABBITMQ_ERLANG_COOKIE');

console.log('rabbitmq-cluster-stack.smoke.js: OK');
