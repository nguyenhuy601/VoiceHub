/**
 * B3 scaffold — consume rbac.v1.* → invalidate permission cache.
 * Full UserRole rebind projection: phase sau (ADR-002).
 * Bật: ENABLE_RBAC_PROJECTION_CONSUMER=true + RABBITMQ_URL.
 */

const amqp = require('amqplib');
const { getRedisClient, logger } = require('@enterprise/shared');
const {
  RBAC_PROJECTION_EVENT_EXCHANGE,
  RBAC_PROJECTION_EVENT_TYPES,
  RBAC_PROJECTION_QUEUE,
  RBAC_PROJECTION_DLQ,
  RBAC_PROJECTION_BINDING_KEYS,
  isKnownRbacProjectionEventType,
} = require('@enterprise/shared/messaging/rbacProjectionEvents');
const {
  orgPermissionSetCacheKey,
  projectPermissionSetCacheKey,
  permissionSetCachePatternForOrg,
  permissionSetCachePatternForUser,
} = require('@enterprise/shared/cache/permissionCacheKeys');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');

let consumerHandle = null;

function isConsumerEnabled() {
  const raw = String(process.env.ENABLE_RBAC_PROJECTION_CONSUMER || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * @param {object} data
 */
async function invalidateFromEvent(data) {
  const redis = getRedisClient();
  if (!redis) return;

  const type = String(data?.type || '').trim();
  const organizationId = data?.organizationId != null ? String(data.organizationId) : '';
  const projectId = data?.projectId != null ? String(data.projectId) : '';
  const userId = data?.userId != null ? String(data.userId) : '';

  if (type === RBAC_PROJECTION_EVENT_TYPES.PERMISSION_CACHE_INVALIDATE) {
    const keys = Array.isArray(data?.payload?.keys) ? data.payload.keys.map(String) : [];
    if (keys.length) {
      await redis.del(...keys);
      return;
    }
  }

  if (userId && organizationId) {
    await redis.del(orgPermissionSetCacheKey(userId, organizationId));
  }
  if (userId && projectId) {
    await redis.del(projectPermissionSetCacheKey(userId, projectId));
  }
  if (userId && !organizationId && !projectId) {
    const pattern = permissionSetCachePatternForUser(userId);
    const found = await redis.keys(pattern);
    if (found.length) await redis.del(...found);
  }
  if (organizationId && !userId) {
    const pattern = permissionSetCachePatternForOrg(organizationId);
    const found = await redis.keys(pattern);
    if (found.length) await redis.del(...found);
  }
}

async function processMessage(data) {
  if (!isKnownRbacProjectionEventType(data?.type)) {
    logger.warn('[rbacProjection] unknown type', data?.type);
    return;
  }
  await invalidateFromEvent(data);
  logger.info('[rbacProjection] processed', {
    type: data.type,
    eventId: data.eventId,
    organizationId: data.organizationId,
  });
}

async function publishDlq(ch, msg, err) {
  await assertQuorumQueue(ch, RBAC_PROJECTION_DLQ);
  ch.sendToQueue(
    RBAC_PROJECTION_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function startRbacProjectionConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) {
    return null;
  }

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(RBAC_PROJECTION_EVENT_EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, RBAC_PROJECTION_QUEUE);
  await assertQuorumQueue(ch, RBAC_PROJECTION_DLQ);

  for (const key of RBAC_PROJECTION_BINDING_KEYS) {
    await ch.bindQueue(RBAC_PROJECTION_QUEUE, RBAC_PROJECTION_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(RBAC_PROJECTION_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString('utf8'));
      await processMessage(data);
      ch.ack(msg);
    } catch (err) {
      logger.error('[rbacProjection] fail', err.message);
      try {
        await publishDlq(ch, msg, err);
      } catch (dlqErr) {
        logger.error('[rbacProjection] dlq', dlqErr.message);
      }
      ch.nack(msg, false, false);
    }
  });

  consumerHandle = { conn, ch, tag };
  await waitForAmqpClose(conn);
  await stopRbacProjectionConsumer();
  return consumerHandle;
}

function runRbacProjectionConsumerLoop() {
  if (!isConsumerEnabled()) {
    logger.info('[rbacProjection] consumer disabled (ENABLE_RBAC_PROJECTION_CONSUMER)');
    return;
  }
  return runWithReconnect('rbacProjectionConsumer', startRbacProjectionConsumer, {
    shouldRun: () => isConsumerEnabled() && Boolean(process.env.RABBITMQ_URL),
  });
}

async function stopRbacProjectionConsumer() {
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
  isConsumerEnabled,
  processMessage,
  invalidateFromEvent,
  runRbacProjectionConsumerLoop,
  stopRbacProjectionConsumer,
};
