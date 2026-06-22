/**
 * P1-0 — prep runbook + inventory smoke
 * node tests/phase1-prep-inventory.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const runbook = read('devops/swarm/phase1-prep-runbook.md');
const inventory = read('docs/phase1-inventory-staging.md');

const scripts = [
  'devops/scripts/phase1-mongodump.sh',
  'devops/scripts/phase1-restore-drill.sh',
  'devops/scripts/phase1-volume-snapshot.sh',
];
for (const s of scripts) {
  assert.ok(fs.existsSync(path.join(root, s)), `missing ${s}`);
}

assert.ok(runbook.includes('phase1-mongodump.sh'));
assert.ok(runbook.includes('--from-service'));
assert.ok(runbook.includes('phase1-restore-drill.sh'));
assert.ok(runbook.includes('phase1-volume-snapshot.sh'));
assert.ok(runbook.includes('Maintenance window'));
assert.ok(runbook.includes('Rollback checkpoint'));

assert.ok(inventory.includes('MONGODB_URI'));
assert.ok(inventory.includes('CHAT_MONGODB_URI'));
assert.ok(inventory.includes('AI_TASK_MONGODB_URI'));

const queues = [
  'voicehub.friend.dm',
  'voicehub.notification.dispatch',
  'task-ai.extract',
  'task-ai.sync',
  'voicehub.task.from_file',
  'voicehub.webhook.delivery',
  'voicehub.org.events.chat',
  'voicehub.org.events.notification',
];
for (const q of queues) {
  assert.ok(inventory.includes(q), `inventory missing queue ${q}`);
}

const redisPrefixes = [
  'vh:presence:',
  'vh:friend_chat_focus:',
  'dm:corr:',
  'bff:',
  'refresh_token:',
];
for (const p of redisPrefixes) {
  assert.ok(inventory.includes(p), `inventory missing redis prefix ${p}`);
}

assert.ok(inventory.includes('mongodb_data'));
assert.ok(inventory.includes('redis_data'));
assert.ok(inventory.includes('rabbitmq_data'));
assert.ok(!inventory.match(/mongodb\+srv:\/\/[^*]+:[^@]+@/), 'inventory must not contain raw credentials');

console.log('phase1-prep-inventory.smoke.js: OK');
