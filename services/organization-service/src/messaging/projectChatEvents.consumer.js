const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const {
  PROJECT_CHAT_EVENT_EXCHANGE,
  PROJECT_CHAT_EVENT_TYPES,
  PROJECT_CHAT_ORG_BINDING_KEYS,
  PROJECT_CHAT_EVENTS_ORG_QUEUE,
  PROJECT_CHAT_EVENTS_ORG_DLQ,
} = require('@enterprise/shared/messaging/projectChatEvents');
const { getRedisClient } = require('@enterprise/shared/config/redis');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');
const { applyMemberChanged } = require('../services/projectMembershipReadModel');
const { applyChannelProvisionEvent } = require('../services/projectChannelProvision.service');
const { invalidateOrgReadCache } = require('../services/orgReadCache.service');

let consumerHandle = null;

const TTL_SEC = Math.max(3600, Number(process.env.PROJECT_CHAT_EVENT_IDEMPOTENCY_TTL_SEC || 86400));

function isConsumerEnabled() {
  const raw = String(process.env.PROJECT_CHAT_ORG_CONSUMER_ENABLED ?? 'true').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return false;
  return true;
}

async function isDuplicateEvent(eventId) {
  const id = String(eventId || '').trim();
  if (!id) return false;
  const redis = getRedisClient();
  if (!redis) return false;
  const res = await redis.set(`org:project:chat:event:${id}`, '1', 'EX', TTL_SEC, 'NX');
  return res !== 'OK';
}

async function publishDlq(ch, msg, err) {
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_ORG_DLQ);
  ch.sendToQueue(
    PROJECT_CHAT_EVENTS_ORG_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function processOrgProjectChatEvent(data) {
  const eventId = String(data?.eventId || '').trim();
  if (eventId && (await isDuplicateEvent(eventId))) {
    logger.warn('[projectChatEvents.consumer] duplicate eventId, skip', { eventId });
    return;
  }

  const type = String(data?.type || '').trim();
  if (type === PROJECT_CHAT_EVENT_TYPES.MEMBER_CHANGED) {
    const status = String(data?.payload?.status || data?.status || '').trim().toLowerCase();
    await applyMemberChanged({
      organizationId: data?.organizationId || data?.payload?.organizationId,
      projectId: data?.projectId || data?.payload?.projectId,
      userId: data?.userId || data?.payload?.userId,
      status,
    });
    const orgId = String(data?.organizationId || data?.payload?.organizationId || '').trim();
    const userId = String(data?.userId || data?.payload?.userId || '').trim();
    if (orgId) {
      await invalidateOrgReadCache(orgId, {
        userId: userId || null,
        structure: false,
        acl: true,
      }).catch(() => null);
    }
    return;
  }

  if (type === PROJECT_CHAT_EVENT_TYPES.CHANNEL_PROVISION) {
    await applyChannelProvisionEvent(data);
  }
}

async function startProjectChatEventsConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) {
    logger.info('[projectChatEvents.consumer] skipped (flag or RABBITMQ_URL)');
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(PROJECT_CHAT_EVENT_EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_ORG_QUEUE);
  await assertQuorumQueue(ch, PROJECT_CHAT_EVENTS_ORG_DLQ);

  for (const key of PROJECT_CHAT_ORG_BINDING_KEYS) {
    await ch.bindQueue(PROJECT_CHAT_EVENTS_ORG_QUEUE, PROJECT_CHAT_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(
    PROJECT_CHAT_EVENTS_ORG_QUEUE,
    async (msg) => {
      if (!msg) return;
      try {
        const raw = JSON.parse(msg.content.toString('utf8'));
        await processOrgProjectChatEvent(raw);
        ch.ack(msg);
      } catch (err) {
        logger.error('[projectChatEvents.consumer] process error', { message: err.message });
        try {
          await publishDlq(ch, msg, err);
        } catch (dlqErr) {
          logger.error('[projectChatEvents.consumer] DLQ publish failed', {
            message: dlqErr.message,
          });
        }
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  conn.on('error', (err) =>
    logger.error('[projectChatEvents.consumer] conn error', { message: err.message })
  );
  logger.info(
    `[projectChatEvents.consumer] listening ${PROJECT_CHAT_EVENTS_ORG_QUEUE} keys=${PROJECT_CHAT_ORG_BINDING_KEYS.join(',')}`
  );

  consumerHandle = { conn, ch, tag };
  await waitForAmqpClose(conn);
  await stopProjectChatEventsConsumer();
  return consumerHandle;
}

function runProjectChatEventsConsumerLoop() {
  return runWithReconnect('projectChatEvents.consumer', startProjectChatEventsConsumer, {
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
  processOrgProjectChatEvent,
  isConsumerEnabled,
};
