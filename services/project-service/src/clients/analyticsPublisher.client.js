/**
 * Analytics / dashboard facts — fire-and-forget (không block request).
 * Bật: ANALYTICS_EVENT_PUBLISH=true + RABBITMQ_URL.
 */

const crypto = require('crypto');
const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const {
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_EVENT_EXCHANGE,
  buildAnalyticsEnvelope,
  routingKeyForAnalyticsType,
} = require('@enterprise/shared/messaging/analyticsEvents');

function isPublishEnabled() {
  const raw = String(process.env.ANALYTICS_EVENT_PUBLISH || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

/**
 * @param {import('amqplib').Channel} ch
 * @param {object} partial
 */
async function publishAnalyticsEvent(ch, partial) {
  const envelope = buildAnalyticsEnvelope(partial);
  const key = routingKeyForAnalyticsType(envelope.type);
  ch.publish(
    ANALYTICS_EVENT_EXCHANGE,
    key,
    Buffer.from(JSON.stringify(envelope)),
    { persistent: true, contentType: 'application/json' }
  );
  return envelope;
}

async function publishAnalyticsEventFireAndForget(partial) {
  if (!isPublishEnabled()) return false;
  const url = process.env.RABBITMQ_URL;
  if (!url) {
    logger.warn('[analytics] skip publish: RABBITMQ_URL missing');
    return false;
  }
  try {
    const envelope = buildAnalyticsEnvelope({
      ...partial,
      eventId: partial.eventId || crypto.randomUUID(),
    });
    const conn = await amqp.connect(url);
    try {
      const ch = await conn.createChannel();
      await ch.assertExchange(ANALYTICS_EVENT_EXCHANGE, 'topic', { durable: true });
      await publishAnalyticsEvent(ch, envelope);
      await ch.close();
    } finally {
      await conn.close();
    }
    return true;
  } catch (err) {
    logger.warn('[analytics] publish failed', err.message);
    return false;
  }
}

function emitTaskFactBestEffort({
  taskId,
  organizationId,
  createdBy,
  assigneeId,
  status,
  doneDelta,
}) {
  const userIds = [createdBy, assigneeId].filter(Boolean).map(String);
  publishAnalyticsEventFireAndForget({
    type: ANALYTICS_EVENT_TYPES.TASK_FACT,
    eventId: crypto.randomUUID(),
    organizationId: organizationId || undefined,
    payload: {
      taskId: taskId ? String(taskId) : undefined,
      status: status || undefined,
      createdBy: createdBy ? String(createdBy) : undefined,
      assigneeId: assigneeId ? String(assigneeId) : undefined,
      userIds,
      doneDelta,
    },
  }).catch(() => null);
}

module.exports = {
  ANALYTICS_EVENT_TYPES,
  publishAnalyticsEvent,
  publishAnalyticsEventFireAndForget,
  emitTaskFactBestEffort,
  isPublishEnabled,
};
