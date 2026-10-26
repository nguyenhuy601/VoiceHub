/**
 * Transports LlmJob routing messages. Memory list for tests; Rabbit for Swarm.
 */

const amqp = require('amqplib');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const {
  resolveLlmJobsTransport,
  resolveLlmJobsQueueName,
  resolveLlmJobsDlqName,
  buildLlmJobQueueMessage,
} = require('./llmJobContract');

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

function resetLlmJobPublisherForTests() {
  memoryMessages.length = 0;
  memoryDlq.length = 0;
}

function drainMemoryMessages() {
  return memoryMessages.splice(0, memoryMessages.length);
}

async function getChannel(env = process.env) {
  const url = String(env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL_missing');
  const queue = resolveLlmJobsQueueName(env);
  const dlq = resolveLlmJobsDlqName(env);
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
 * @param {object} job
 * @param {NodeJS.ProcessEnv} [env]
 */
async function publishLlmJob(job, env = process.env) {
  const message = buildLlmJobQueueMessage(job);
  if (!message.jobId) throw new Error('llm_job_id_required');
  if (resolveLlmJobsTransport(env) === 'memory') {
    memoryMessages.push(message);
    return { ok: true, transport: 'memory', message };
  }
  const queue = resolveLlmJobsQueueName(env);
  await send(queue, message, env);
  return { ok: true, transport: 'rabbit', queue, message };
}

async function publishLlmJobDlq(job, reason, env = process.env) {
  const message = { ...buildLlmJobQueueMessage(job), dlqReason: String(reason || '').slice(0, 240) };
  if (resolveLlmJobsTransport(env) === 'memory') {
    memoryDlq.push(message);
    return { ok: true, transport: 'memory' };
  }
  const dlq = resolveLlmJobsDlqName(env);
  await send(dlq, message, env);
  return { ok: true, transport: 'rabbit', queue: dlq };
}

module.exports = {
  publishLlmJob,
  publishLlmJobDlq,
  listMemoryMessages,
  listMemoryDlq,
  resetLlmJobPublisherForTests,
  drainMemoryMessages,
};
