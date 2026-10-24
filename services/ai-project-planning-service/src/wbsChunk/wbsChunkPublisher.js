/**
 * Transports a WBS chunk message. Does not inspect SRS or decide the next planning job.
 */

const amqp = require('amqplib');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const {
  resolveWbsChunkTransport,
  resolveWbsChunkQueueName,
  resolveWbsChunkDlqName,
  buildWbsChunkQueueMessage,
} = require('./wbsChunkContract');

/** @type {object[]} */
const memoryMessages = [];
/** @type {object[]} */
const memoryDlq = [];

let cached = { url: null, conn: null, ch: null };

function listMemoryMessages() {
  return memoryMessages.map((row) => ({ ...row }));
}

function listMemoryDlq() {
  return memoryDlq.map((row) => ({ ...row }));
}

function resetWbsChunkPublisherForTests() {
  memoryMessages.length = 0;
  memoryDlq.length = 0;
}

async function getChannel(env = process.env) {
  const url = String(env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL_missing');
  const queue = resolveWbsChunkQueueName(env);
  const dlq = resolveWbsChunkDlqName(env);
  if (cached.conn && cached.url === url && cached.ch) return cached.ch;
  if (cached.conn) {
    try {
      await cached.conn.close();
    } catch {
      /* ignore */
    }
  }
  const conn = await amqp.connect(url);
  const ch = await assertQueuesResilient(conn, [queue, dlq]);
  cached = { url, conn, ch };
  return ch;
}

async function send(queue, message, env) {
  const ch = await getChannel(env);
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(message), 'utf8'), {
    persistent: true,
    contentType: 'application/json',
  });
}

/**
 * @param {object} unit
 * @param {NodeJS.ProcessEnv} [env]
 */
async function publishWbsChunk(unit, env = process.env) {
  const message = buildWbsChunkQueueMessage(unit);
  if (!message.workUnitId) throw new Error('wbs_chunk_work_unit_required');
  if (resolveWbsChunkTransport(env) === 'memory') {
    memoryMessages.push(message);
    return { ok: true, transport: 'memory', message };
  }
  const queue = resolveWbsChunkQueueName(env);
  await send(queue, message, env);
  return { ok: true, transport: 'rabbit', queue, message };
}

/**
 * Operational copy. The work-unit row remains the status source of truth.
 * @param {object} unit
 */
async function publishWbsChunkDeadLetter(unit, env = process.env) {
  const message = {
    ...buildWbsChunkQueueMessage(unit),
    jobType: 'WBS_GENERATE_CHUNK_DLQ',
    error: unit.error || null,
  };
  if (resolveWbsChunkTransport(env) === 'memory') {
    memoryDlq.push(message);
    return { ok: true, transport: 'memory', message };
  }
  const queue = resolveWbsChunkDlqName(env);
  await send(queue, message, env);
  return { ok: true, transport: 'rabbit', queue, message };
}

async function closeWbsChunkPublisher() {
  if (cached.conn) {
    try {
      await cached.conn.close();
    } catch {
      /* ignore */
    }
  }
  cached = { url: null, conn: null, ch: null };
}

module.exports = {
  publishWbsChunk,
  publishWbsChunkDeadLetter,
  listMemoryMessages,
  listMemoryDlq,
  resetWbsChunkPublisherForTests,
  closeWbsChunkPublisher,
};
