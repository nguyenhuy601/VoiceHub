const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const {
  DASHBOARD_PROJECTION_EVENT_EXCHANGE,
  DASHBOARD_PROJECTION_EVENT_TYPES,
  DASHBOARD_PROJECTION_QUEUE,
  DASHBOARD_PROJECTION_DLQ,
  DASHBOARD_PROJECTION_BINDING_KEYS,
  isKnownDashboardProjectionEventType,
} = require('@enterprise/shared/messaging/dashboardProjectionEvents');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { runWithReconnect, waitForAmqpClose } = require('@enterprise/shared/messaging/rabbitReconnect');
const { applyTaskFact } = require('../services/dashboardReadModel.redis');
const { refreshDashboardSnapshot } = require('../services/dashboardSnapshotRefresh.service');

let consumerHandle = null;
const refreshTimers = new Map();
const REFRESH_DEBOUNCE_MS = Math.max(
  500,
  Number(process.env.DASHBOARD_REFRESH_DEBOUNCE_MS || 2000) || 2000
);

function isConsumerEnabled() {
  const raw = String(process.env.ENABLE_DASHBOARD_PROJECTION_CONSUMER || 'false').toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes';
}

function scheduleRefresh(userId, eventId) {
  const uid = String(userId || '').trim();
  if (!uid) return;
  const prev = refreshTimers.get(uid);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    refreshTimers.delete(uid);
    refreshDashboardSnapshot(uid, eventId ? `${eventId}:refresh` : undefined).catch((e) => {
      logger.warn('[dashboardProjection] refresh failed', e.message);
    });
  }, REFRESH_DEBOUNCE_MS);
  refreshTimers.set(uid, timer);
}

function userIdsFromEvent(data) {
  const ids = new Set();
  if (data?.userId) ids.add(String(data.userId));
  const payload = data?.payload || {};
  for (const key of ['userId', 'createdBy', 'assigneeId']) {
    if (payload[key]) ids.add(String(payload[key]));
  }
  if (Array.isArray(payload.userIds)) {
    payload.userIds.forEach((id) => ids.add(String(id)));
  }
  return [...ids].filter(Boolean);
}

async function processMessage(data) {
  const type = String(data?.type || '').trim();
  if (!isKnownDashboardProjectionEventType(type)) {
    logger.warn('[dashboardProjection] unknown type', type);
    return;
  }

  const userIds = userIdsFromEvent(data);
  const eventId = String(data?.eventId || '').trim();

  if (type === DASHBOARD_PROJECTION_EVENT_TYPES.USER_SNAPSHOT) {
    for (const uid of userIds) {
      await refreshDashboardSnapshot(uid, eventId || undefined);
    }
    return;
  }

  if (type === DASHBOARD_PROJECTION_EVENT_TYPES.REFRESH_REQUESTED) {
    for (const uid of userIds) scheduleRefresh(uid, eventId);
    return;
  }

  if (type === DASHBOARD_PROJECTION_EVENT_TYPES.TASK_FACT) {
    const payload = data.payload || {};
    const incremental = payload.doneDelta != null || payload.taskDone != null;
    if (incremental) {
      for (const uid of userIds) {
        await applyTaskFact(uid, payload, eventId ? `${eventId}:${uid}` : undefined);
      }
    }
    for (const uid of userIds) scheduleRefresh(uid, eventId);
    return;
  }

  for (const uid of userIds) scheduleRefresh(uid, eventId);
}

async function publishDlq(ch, msg, err) {
  await assertQuorumQueue(ch, DASHBOARD_PROJECTION_DLQ);
  ch.sendToQueue(
    DASHBOARD_PROJECTION_DLQ,
    Buffer.from(
      JSON.stringify({
        error: String(err?.message || err || 'unknown'),
        original: msg.content.toString('utf8'),
      })
    ),
    { persistent: true, contentType: 'application/json' }
  );
}

async function startDashboardProjectionConsumer() {
  const url = process.env.RABBITMQ_URL;
  if (!isConsumerEnabled() || !url) return null;

  const conn = await amqp.connect(url);
  const ch = await conn.createChannel();
  await ch.assertExchange(DASHBOARD_PROJECTION_EVENT_EXCHANGE, 'topic', { durable: true });
  await assertQuorumQueue(ch, DASHBOARD_PROJECTION_QUEUE);
  await assertQuorumQueue(ch, DASHBOARD_PROJECTION_DLQ);

  for (const key of DASHBOARD_PROJECTION_BINDING_KEYS) {
    await ch.bindQueue(DASHBOARD_PROJECTION_QUEUE, DASHBOARD_PROJECTION_EVENT_EXCHANGE, key);
  }

  const { consumerTag: tag } = await ch.consume(DASHBOARD_PROJECTION_QUEUE, async (msg) => {
    if (!msg) return;
    try {
      const data = JSON.parse(msg.content.toString('utf8'));
      await processMessage(data);
      ch.ack(msg);
    } catch (err) {
      logger.error('[dashboardProjection] fail', err.message);
      try {
        await publishDlq(ch, msg, err);
      } catch (dlqErr) {
        logger.error('[dashboardProjection] dlq', dlqErr.message);
      }
      ch.nack(msg, false, false);
    }
  });

  consumerHandle = { conn, ch, tag };
  await waitForAmqpClose(conn);
  await stopDashboardProjectionConsumer();
  return consumerHandle;
}

function runDashboardProjectionConsumerLoop() {
  if (!isConsumerEnabled()) {
    logger.info('[dashboardProjection] consumer disabled');
    return;
  }
  return runWithReconnect('dashboardProjectionConsumer', startDashboardProjectionConsumer, {
    shouldRun: () => isConsumerEnabled() && Boolean(process.env.RABBITMQ_URL),
  });
}

async function stopDashboardProjectionConsumer() {
  for (const t of refreshTimers.values()) clearTimeout(t);
  refreshTimers.clear();
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
  scheduleRefresh,
  runDashboardProjectionConsumerLoop,
  stopDashboardProjectionConsumer,
};
