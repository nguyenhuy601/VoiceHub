/**
 * P1-Mongo — Atlas migration smoke
 * node tests/p1-atlas-migration.smoke.js
 * PHASE1_ATLAS_LIVE=1 — ping Atlas per logical DB
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const runbook = read('devops/swarm/p1-atlas-migration-runbook.md');
const atlasDoc = read('docs/atlas-staging-config.md');

assert.ok(runbook.includes('phase1-atlas-uri-cutover.mjs'));
assert.ok(runbook.includes('phase1-mongorestore-atlas.sh'));
assert.ok(atlasDoc.includes('mongodb+srv'));

const scripts = [
  'devops/scripts/phase1-atlas-uri-audit.sh',
  'devops/scripts/phase1-atlas-uri-cutover.mjs',
  'devops/scripts/phase1-mongorestore-atlas.sh',
  'devops/scripts/phase1-atlas-verify.sh',
];
for (const s of scripts) {
  assert.ok(fs.existsSync(path.join(root, s)), `missing ${s}`);
}

const services = [
  'auth-service',
  'user-service',
  'organization-service',
  'friend-service',
  'chat-service',
  'task-service',
  'notification-service',
  'document-service',
  'voice-service',
  'role-permission-service',
  'ai-task-service',
  'ai-task-worker',
];

function envLine(file, key) {
  const t = fs.readFileSync(file, 'utf8');
  const m = t.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
}

for (const svc of services) {
  const file = path.join(root, 'services', svc, '.env');
  assert.ok(fs.existsSync(file), `${svc} .env missing`);
  const uri = envLine(file, 'MONGODB_URI');
  assert.ok(uri, `${svc}: MONGODB_URI missing`);
  assert.ok(uri.startsWith('mongodb+srv://') || uri.includes('mongodb.net'), `${svc}: not Atlas`);
  assert.ok(!uri.includes('mongodb:27017'), `${svc}: local mongo URI`);
}

assert.ok(envLine(path.join(root, 'services/chat-service/.env'), 'CHAT_MONGODB_URI'), 'chat-service: CHAT_MONGODB_URI');
assert.ok(envLine(path.join(root, 'services/ai-task-service/.env'), 'AI_TASK_MONGODB_URI'), 'ai-task-service: AI_TASK_MONGODB_URI');
assert.ok(envLine(path.join(root, 'services/ai-task-worker/.env'), 'AI_TASK_MONGODB_URI'), 'ai-task-worker: AI_TASK_MONGODB_URI');

const mongoJs = read('shared/config/mongo.js');
assert.ok(mongoJs.includes('retryWrites'));
assert.ok(mongoJs.includes('mongodb+srv://'));

if (process.env.PHASE1_ATLAS_LIVE === '1') {
  execSync('bash devops/scripts/phase1-mongorestore-atlas.sh --verify-only', {
    cwd: root,
    stdio: 'inherit',
  });
}

console.log('p1-atlas-migration.smoke.js: OK');
