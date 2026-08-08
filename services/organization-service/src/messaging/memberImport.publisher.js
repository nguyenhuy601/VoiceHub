/**
 * Queue durable cho Confirm Excel import (async job).
 * Fallback inline (setImmediate) nếu RabbitMQ không publish được — HTTP vẫn trả nhanh.
 */
const amqp = require('amqplib');
const { logger } = require('@enterprise/shared');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');

const MEMBER_IMPORT_QUEUE =
  String(process.env.MEMBER_IMPORT_QUEUE || 'organization.member.import').trim() ||
  'organization.member.import';

let conn = null;
let channel = null;

function isAsyncConfirmEnabled() {
  const raw = String(process.env.IMPORT_CONFIRM_ASYNC ?? 'true').toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'no';
}

async function getChannel() {
  if (channel) return channel;
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');
  conn = await amqp.connect(url);
  channel = await conn.createChannel();
  conn.on('error', () => {
    channel = null;
    conn = null;
  });
  conn.on('close', () => {
    channel = null;
    conn = null;
  });
  await assertQuorumQueue(channel, MEMBER_IMPORT_QUEUE);
  return channel;
}

/**
 * @param {{ organizationId: string, batchId: string }} job
 * @returns {Promise<boolean>} true nếu đã vào queue
 */
async function publishMemberImportJob(job) {
  const organizationId = String(job?.organizationId || '').trim();
  const batchId = String(job?.batchId || '').trim();
  if (!organizationId || !batchId) return false;
  if (!process.env.RABBITMQ_URL) return false;

  const ch = await getChannel();
  const body = {
    organizationId,
    batchId,
    at: new Date().toISOString(),
  };
  const buf = Buffer.from(JSON.stringify(body));
  const opts = { persistent: true, contentType: 'application/json', messageId: batchId };
  const ok = ch.sendToQueue(MEMBER_IMPORT_QUEUE, buf, opts);
  if (!ok) {
    await new Promise((resolve) => ch.once('drain', resolve));
    ch.sendToQueue(MEMBER_IMPORT_QUEUE, buf, opts);
  }
  return true;
}

/**
 * Enqueue RabbitMQ; nếu fail / consumer chưa sẵn → chạy processFn nền trong process.
 * @param {{ organizationId: string, batchId: string }} job
 * @param {(job: { organizationId: string, batchId: string }) => Promise<unknown>} processFn
 */
async function enqueueMemberImportOrRunInline(job, processFn) {
  let consumerAlive = false;
  try {
    // eslint-disable-next-line global-require
    consumerAlive = Boolean(require('./memberImport.consumer').isConsumerAlive?.());
  } catch {
    consumerAlive = false;
  }

  if (consumerAlive) {
    try {
      const queued = await publishMemberImportJob(job);
      if (queued) {
        logger.info('[memberImport] enqueued', { batchId: job.batchId });
        return { mode: 'queue' };
      }
    } catch (e) {
      logger.warn('[memberImport] publish failed, fallback inline', e?.message || e);
    }
  } else {
    logger.info('[memberImport] consumer not ready — inline fallback', { batchId: job.batchId });
  }

  setImmediate(() => {
    Promise.resolve()
      .then(() => processFn(job))
      .catch((err) => {
        logger.error('[memberImport] inline process failed', {
          batchId: job.batchId,
          message: err?.message || err,
        });
      });
  });
  return { mode: 'inline' };
}

module.exports = {
  MEMBER_IMPORT_QUEUE,
  isAsyncConfirmEnabled,
  publishMemberImportJob,
  enqueueMemberImportOrRunInline,
};
