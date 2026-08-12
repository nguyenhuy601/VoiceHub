/**
 * Consumer: Confirm Excel import async (cùng process organization-service).
 * Reconnect khi RabbitMQ tạm down lúc boot.
 */
const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { MEMBER_IMPORT_QUEUE } = require('./memberImport.publisher');

let stopping = false;
let consumerAlive = false;

function isConsumerEnabled() {
  const raw = String(process.env.MEMBER_IMPORT_CONSUMER_ENABLED ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

function isConsumerAlive() {
  return consumerAlive;
}

async function bindAndConsume(conn) {
  const { processImportBatch } = require('../services/resourceImport.service');
  const ch = await conn.createChannel();
  await assertQuorumQueue(ch, MEMBER_IMPORT_QUEUE);
  await ch.prefetch(1);

  logger.info(`[memberImport.consumer] listening queue=${MEMBER_IMPORT_QUEUE}`);
  consumerAlive = true;

  ch.consume(MEMBER_IMPORT_QUEUE, async (msg) => {
    if (!msg || stopping) return;
    let payload = null;
    try {
      payload = JSON.parse(msg.content.toString('utf8'));
      const organizationId = String(payload?.organizationId || '').trim();
      const batchId = String(payload?.batchId || '').trim();
      if (!organizationId || !batchId) {
        ch.ack(msg);
        return;
      }
      await processImportBatch({ organizationId, batchId });
      ch.ack(msg);
    } catch (err) {
      logger.error('[memberImport.consumer] job failed', {
        message: err?.message || err,
        batchId: payload?.batchId,
      });
      ch.ack(msg);
    }
  });

  return ch;
}

async function connectOnce() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL missing');
  const conn = await amqp.connect(url);
  const ch = await bindAndConsume(conn);

  conn.on('error', (e) => {
    consumerAlive = false;
    logger.warn('[memberImport.consumer] connection error', e?.message || e);
  });
  conn.on('close', () => {
    consumerAlive = false;
    if (!stopping) {
      logger.warn('[memberImport.consumer] connection closed — reconnecting…');
      scheduleReconnect();
    }
  });

  return {
    stop: async () => {
      stopping = true;
      consumerAlive = false;
      try {
        await ch.close();
      } catch {
        /* ignore */
      }
      try {
        await conn.close();
      } catch {
        /* ignore */
      }
    },
  };
}

let reconnectTimer = null;
let handle = null;

function scheduleReconnect() {
  if (stopping || reconnectTimer) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    try {
      handle = await connectOnce();
    } catch (e) {
      logger.warn('[memberImport.consumer] reconnect failed', e?.message || e);
      scheduleReconnect();
    }
  }, 5000);
}

/**
 * @returns {Promise<{ stop: Function }|null>}
 */
async function startMemberImportConsumer() {
  if (!isConsumerEnabled() || !process.env.RABBITMQ_URL) {
    logger.info('[memberImport.consumer] skipped (disabled or no RABBITMQ_URL)');
    return null;
  }

  const maxAttempts = Math.max(1, Number(process.env.MEMBER_IMPORT_CONSUMER_BOOT_RETRIES || 8) || 8);
  let lastErr = null;
  for (let i = 1; i <= maxAttempts; i += 1) {
    try {
      handle = await connectOnce();
      return handle;
    } catch (e) {
      lastErr = e;
      logger.warn(`[memberImport.consumer] boot attempt ${i}/${maxAttempts} failed`, e?.message || e);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  // Vẫn schedule reconnect nền — Confirm dùng inline fallback nếu publish fail
  scheduleReconnect();
  throw lastErr || new Error('memberImport consumer failed to start');
}

module.exports = {
  startMemberImportConsumer,
  isConsumerEnabled,
  isConsumerAlive,
};
