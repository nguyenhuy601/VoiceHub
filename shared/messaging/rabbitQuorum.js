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

function isQueueTypeMismatchError(err) {
  const msg = String(err?.message || err || '');
  return msg.includes('PRECONDITION_FAILED') || msg.includes('inequivalent');
}

async function assertQuorumQueue(channel, name, extra = {}) {
  return channel.assertQueue(name, quorumQueueOptions(extra));
}

/**
 * Declare multiple queues on one channel. If quorum args mismatch existing classic queues,
 * reopen channel and re-declare all as classic (broker closes channel on precondition_failed).
 */
async function assertQueuesResilient(conn, queueNames, extra = {}) {
  const names = [...new Set((queueNames || []).map((n) => String(n || '').trim()).filter(Boolean))];
  if (!names.length) {
    return conn.createChannel();
  }

  let ch = await conn.createChannel();
  if (!isQuorumQueuesEnabled()) {
    for (const name of names) {
      await ch.assertQueue(name, { durable: true, ...extra });
    }
    return ch;
  }

  try {
    for (const name of names) {
      await ch.assertQueue(name, quorumQueueOptions(extra));
    }
    return ch;
  } catch (err) {
    if (!isQueueTypeMismatchError(err)) {
      try {
        await ch.close();
      } catch {
        /* ignore */
      }
      throw err;
    }
    try {
      await ch.close();
    } catch {
      /* ignore */
    }
    ch = await conn.createChannel();
    for (const name of names) {
      await ch.assertQueue(name, { durable: true, ...extra });
    }
    return ch;
  }
}

module.exports = {
  isQuorumQueuesEnabled,
  isQueueTypeMismatchError,
  quorumQueueOptions,
  assertQuorumQueue,
  assertQueuesResilient,
};
