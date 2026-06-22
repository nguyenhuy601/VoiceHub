/**
 * P1-Rabbit-B — Quorum queue helpers (classic rollback: RABBITMQ_QUORUM_QUEUES=false)
 */

function isQuorumQueuesEnabled() {
  const raw = String(process.env.RABBITMQ_QUORUM_QUEUES ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function quorumQueueOptions(extra = {}) {
  const base = { durable: true, ...extra };
  if (!isQuorumQueuesEnabled()) {
    return base;
  }
  const args = { ...(base.arguments || {}), 'x-queue-type': 'quorum' };
  return { ...base, arguments: args };
}

async function assertQuorumQueue(channel, name, extra = {}) {
  return channel.assertQueue(name, quorumQueueOptions(extra));
}

module.exports = {
  isQuorumQueuesEnabled,
  quorumQueueOptions,
  assertQuorumQueue,
};
