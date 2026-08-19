const amqp = require('amqplib');
const {
  PROJECT_CHAT_EVENT_EXCHANGE,
  PROJECT_CHAT_EVENT_TYPES,
  PROJECT_CHAT_EVENT_BINDING_KEYS,
  PROJECT_CHAT_EVENTS_CHAT_QUEUE,
  PROJECT_CHAT_EVENTS_CHAT_DLQ,
} = require('@enterprise/shared/messaging/projectChatEvents');
const { getRedisClient } = require('@enterprise/shared/config/redis');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');
const { applyMemberChanged } = require('../services/projectMembershipReadModel');

let consumerHandle = null;

const TTL_SEC = Math.max(3600, Number(process.env.PROJECT_CHAT_EVENT_IDEMPOTENCY_TTL_SEC || 86400));

function isConsumerEnabled() {
  const raw = String(process.env.PROJECT_CHAT_MEMBER_CONSUMER_ENABLED ?? 'true').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return true;
}

async function isDuplicateEvent(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  const res = await redis.set(`project:chat:event:${id}`, '1', 'EX', TTL_SEC, 'NX');
  return res !== 'OK';
}

async function publishDlq(ch, msg, err) {
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_CHAT_DLQ);
  ch.sendToQueue(
    PROJECT_CHAT_EVENTS_CHAT_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function processProjectChatEvent(data) {
  const eventId = String(data?.eventId || '').trim();
  if (eventId && (await isDuplicateEvent(eventId))) {
    console.warn('[projectChatEventsConsumer] duplicate eventId, skip', eventId);
    return;
  }

  const type = String(data?.type || '').trim();
  if (type !== PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED) return;

  const status = String(data?.payload?.status || data?.status || '').trim().toLowerCase();
  await applyMemberChanged({
    organizationId: data?.organizationId || data?.payload?.organizationId,
    projectId: data?.projectId || data?.payload?.projectId,
    userId: data?.userId || data?.payload?.userId,
    status,
  });
}

async function startProjectChatEventsConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) {
    console.log('[projectChatEventsConsumer] skipped (flag or RABBITMQ_URL)');
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(PROJECT_CHAT_EVENT_EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_CHAT_QUEUE);
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_CHAT_DLQ);

  for (const key of PROJECT_CHAT_EVENT_BINDING_KEYS) {
    await ch.bindQueue(PROJECT_CHAT_EVENTS_CHAT_QUEUE, PROJECT_CHAT_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(
    PROJECT_CHAT_EVENTS_CHAT_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processProjectChatEvent(raw);
        ch.ack(msg);
      } catch (err) {
        console.error('[projectChatEventsConsumer] process error', err.message);
        try {
          await publishDlq(ch, msg, err);
        } catch (dlqErr) {
          console.error('[projectChatEventsConsumer] DLQ publish failed', dlqErr.message);
        }
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) => console.error('[projectChatEventsConsumer] conn error', err.message));
  console.log(
    `[projectChatEventsConsumer] listening ${PROJECT_CHAT_EVENTS_CHAT_QUEUE} keys=${PROJECT_CHAT_EVENT_BINDING_KEYS.join(',')}`
  );

  consumerHandle = { conn, ch, tag };
  await waitForAmqpClose(conn);
  await stopProjectChatEventsConsumer();
  return consumerHandle;
}

function runProjectChatEventsConsumerLoop() {
  return runWithReconnect('projectChatEventsConsumer', startProjectChatEventsConsumer, {
    shouldRun: () => isConsumerEnabled() && Boolean(process.env.RABBITMQ_URL),
  });
}

async function stopProjectChatEventsConsumer() {
  if (!consumerHandle) return;
  try {
    await consumerHandle.ch.cancel(consumerHandle.tag);
  } catch {
    /* ignore */
  }
  try {
    await consumerHandle.ch.close();
  } catch {
    /* ignore */
  }
  try {
    await consumerHandle.conn.close();
  } catch {
    /* ignore */
  }
  consumerHandle = null;
}

module.exports = {
  startProjectChatEventsConsumer,
  stopProjectChatEventsConsumer,
  runProjectChatEventsConsumerLoop,
  processProjectChatEvent,
  isConsumerEnabled,
};
