/**
 * P1-Cutover — stack compose + runbook smoke
 * node tests/p1-swarm-cutover.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const stack = read('docker-stack.yml');
const planA = read('docker-stack.plan-a.yml');

assert.ok(!stack.includes('\n  mongodb:\n'), 'docker-stack.yml must not define mongodb service');
assert.ok(!stack.includes('\n  redis:\n'), 'docker-stack.yml must not define redis service');
assert.ok(!stack.includes('\n  rabbitmq:\n'), 'docker-stack.yml must not define rabbitmq service');
assert.ok(!stack.includes('mongodb_data:'), 'docker-stack.yml must not define mongodb_data volume');

const planService = (name) => new RegExp(`\\n  ${name}:\\r?\\n`).test(planA);
assert.ok(planService('mongodb'), 'plan-a must keep mongodb for rollback');
assert.ok(planService('redis'), 'plan-a must keep redis for rollback');
assert.ok(planService('rabbitmq'), 'plan-a must keep rabbitmq for rollback');

const scripts = [
  'devops/swarm/deploy-phase1-cutover.sh',
  'devops/swarm/phase1-pre-cutover-snapshot.sh',
  'devops/swarm/rolling-update-phase1-env.sh',
  'devops/swarm/phase1-rollback.md',
  'docker-stack.plan-a.yml',
];
for (const s of scripts) {
  assert.ok(fs.existsSync(path.join(root, s)), `missing ${s}`);
}

const deploy = read('devops/swarm/deploy-stack.sh');
assert.ok(deploy.includes('DEPLOY_HA_INFRA'), 'deploy-stack.sh must support HA infra flag');
assert.ok(deploy.includes('source "$ROOT/.env"'), 'deploy-stack.sh must source .env');

const rollback = read('devops/swarm/phase1-rollback.md');
assert.ok(rollback.includes('docker-stack.plan-a.yml'));

const env = read('.env');
assert.ok(env.includes('REDIS_SENTINELS='), '.env must set REDIS_SENTINELS for cutover');
assert.ok(env.includes('rabbitmq-1:5672'), '.env must use rabbitmq-1 cluster entry');

console.log('p1-swarm-cutover.smoke.js: OK');
