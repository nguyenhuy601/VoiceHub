/**
 * Analytics ETL consumer — ingest task/worklog/status facts → warehouse rollup.
 * Flag: ENABLE_ANALYTICS_ETL_CONSUMER=true + RABBITMQ_URL + ANALYTICS_MONGODB_URI.
 */

const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const {
  ANALYTICS_EVENT_EXCHANGE,
  ANALYTICS_EVENT_TYPES,
  ANALYTICS_ETL_QUEUE,
  ANALYTICS_ETL_DLQ,
  ANALYTICS_EVENT_BINDING_KEYS,
  isKnownAnalyticsEventType,
} = require('@enterprise/shared/messaging/analyticsEvents');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');
const { connectAnalyticsDb } = require('../db/analyticsDb');
const { ingestAnalyticsEnvelope } = require('../services/userPerformance.warehouse');

let consumerHandle = null;

function isConsumerEnabled() {
  const raw = String(process.env.ENABLE_ANALYTICS_ETL_CONSUMER || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

async function publishDlq(ch, msg, err) {
  await assertQuorumQueue(ch, ANALYTICS_ETL_DLQ);
  ch.sendToQueue(
    ANALYTICS_ETL_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function processMessage(data) {
  const type = String(data?.type || '').trim();
  if (!isKnownAnalyticsEventType(type)) {
    logger.warn('[analyticsEtl] unknown type', type);
    return;
  }
  // Skip utilization_snapshot (notify-only)
  if (type === ANALYTICS_EVENT_TYPES.UTILIZATION_SNAPSHOT) return;
  await ingestAnalyticsEnvelope(data);
}

async function startAnalyticsEtlConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) return null;

  await connectAnalyticsDb();

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(ANALYTICS_EVENT_EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, ANALYTICS_ETL_QUEUE);
  await assertQuorumQueue(ch, ANALYTICS_ETL_DLQ);

  for (const key of ANALYTICS_EVENT_BINDING_KEYS) {
    await ch.bindQueue(ANALYTICS_ETL_QUEUE, ANALYTICS_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(ANALYTICS_ETL_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString('utf8'));
      await processMessage(data);
      ch.ack(msg);
    } catch (err) {
      logger.error('[analyticsEtl] fail', err.message);
      try {
        await publishDlq(ch, msg, err);
      } catch (dlqErr) {
        logger.error('[analyticsEtl] dlq', dlqErr.message);
      }
      ch.nack(msg, false, false);
    }
  });

  consumerHandle = { conn, ch, tag };
  logger.info('[analyticsEtl] consumer started');
  await waitForAmqpClose(conn);
  await stopAnalyticsEtlConsumer();
  return consumerHandle;
}

function runAnalyticsEtlConsumerLoop() {
  if (!isConsumerEnabled()) {
    logger.info('[analyticsEtl] consumer disabled');
    return;
  }
  return runWithReconnect('analyticsEtlConsumer', startAnalyticsEtlConsumer, {
    shouldRun: () => isConsumerEnabled() && Boolean(process.env.RABBITMQ_URL),
  });
}

async function stopAnalyticsEtlConsumer() {
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
  runAnalyticsEtlConsumerLoop,
  stopAnalyticsEtlConsumer,
  isConsumerEnabled,
  processMessage,
};
