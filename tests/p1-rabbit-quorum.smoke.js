/**
 * P1-Rabbit-B — quorum helpers + inventory smoke
 * node tests/p1-rabbit-quorum.smoke.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

const {
  isQuorumQueuesEnabled,
  quorumQueueOptions,
} = require('../shared/messaging/rabbitQuorum');
const { runWithReconnect, sleep, waitForAmqpClose } = require('../shared/messaging/rabbitReconnect');

assert.strictEqual(typeof isQuorumQueuesEnabled, 'function');
assert.strictEqual(typeof quorumQueueOptions, 'function');
assert.strictEqual(typeof runWithReconnect, 'function');
assert.strictEqual(typeof sleep, 'function');
assert.strictEqual(typeof waitForAmqpClose, 'function');

const prev = process.env.RABBITMQ_QUORUM_QUEUES;
try {
  delete process.env.RABBITMQ_QUORUM_QUEUES;
  const defaultOpts = quorumQueueOptions();
  assert.strictEqual(defaultOpts.durable, true);
  assert.strictEqual(defaultOpts.arguments['x-queue-type'], 'quorum');

  process.env.RABBITMQ_QUORUM_QUEUES = 'false';
  assert.strictEqual(isQuorumQueuesEnabled(), false);
  const classicOpts = quorumQueueOptions();
  assert.strictEqual(classicOpts.arguments, undefined);

  process.env.RABBITMQ_QUORUM_QUEUES = 'true';
  assert.strictEqual(isQuorumQueuesEnabled(), true);
} finally {
  if (prev === undefined) delete process.env.RABBITMQ_QUORUM_QUEUES;
  else process.env.RABBITMQ_QUORUM_QUEUES = prev;
}

const inventory = read('docs/rabbitmq-quorum-inventory.md');
const migration = read('devops/swarm/rabbitmq-cluster/p1-quorum-migration.md');
const purgeScript = 'devops/swarm/rabbitmq-cluster/purge-classic-queues.sh';

assert.ok(fs.existsSync(path.join(root, purgeScript)), `missing ${purgeScript}`);
assert.ok(inventory.includes('assertQuorumQueue'));
assert.ok(migration.includes('RABBITMQ_QUORUM_QUEUES=false'));

const workerFiles = [
  'services/chat-service/src/workers/friendDmConsumer.js',
  'services/notification-service/src/workers/notificationDispatch.worker.js',
  'services/task-service/src/workers/taskFromFileWorker.js',
  'services/ai-task-worker/src/worker.js',
  'services/webhook-service/src/utils/webhook_queue.py',
];

for (const f of workerFiles) {
  const src = read(f);
  assert.ok(
    src.includes('assertQuorumQueue') || src.includes('_declare_quorum_queue'),
    `${f} must use quorum queue declare`
  );
  assert.ok(
    src.includes('runWithReconnect') ||
      src.includes('runFriendDmConsumerLoop') ||
      src.includes('runNotificationDispatchWorkerLoop') ||
      src.includes('runTaskFromFileWorkerLoop') ||
      src.includes('waitForAmqpClose') ||
      src.includes('consume_webhook_jobs_with_reconnect') ||
      src.includes('while (!shuttingDown)'),
    `${f} must include reconnect pattern`
  );
}

const queues = [
  'voicehub.friend.dm',
  'voicehub.notification.dispatch',
  'task-ai.extract',
  'task-ai.sync',
  'voicehub.task.from_file',
  'voicehub.webhook.delivery',
];
for (const q of queues) {
  assert.ok(inventory.includes(q), `inventory missing ${q}`);
}

console.log('p1-rabbit-quorum.smoke.js: OK');
