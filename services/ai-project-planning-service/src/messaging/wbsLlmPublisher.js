/**
 * Wave M — publish WBS LLM job to RabbitMQ (or memory fan-out for tests).
 */

const amqp = require('amqplib');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const {
  resolveWbsLlmQueueName,
  isWbsLlmJobMemoryStore,
} = require('../contracts/howWbsLlmQueueContract');

/** @type {((msg: object) => void)[]} */
const memorySubscribers = [];

let cached = { url: null, conn: null, ch: null, queue: null };

function subscribeMemory(handler) {
  memorySubscribers.push(handler);
  return () => {
    const i = memorySubscribers.indexOf(handler);
    if (i >= 0) memorySubscribers.splice(i, 1);
  };
}

async function getChannel(env = process.env) {
  const url = String(env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL_missing');
  const queue = resolveWbsLlmQueueName(env);
  if (cached.conn && cached.url === url && cached.ch && cached.queue === queue) {
    return cached.ch;
  }
  if (cached.conn) {
    try {
      await cached.conn.close();
    } catch {
      /* ignore */
    }
  }
  const conn = await amqp.connect(url);
  const ch = await assertQueuesResilient(conn, [queue]);
  cached = { url, conn, ch, queue };
  return ch;
}

/**
 * @param {{ jobId: string, runId?: string|null }} payload
 * @param {NodeJS.ProcessEnv} [env]
 */
async function publishWbsLlmJob(payload, env = process.env) {
  const body = {
    jobId: String(payload.jobId || '').trim(),
    runId: payload.runId != null ? String(payload.runId) : null,
    publishedAt: new Date().toISOString(),
  };
  if (!body.jobId) throw new Error('wbs_llm_job_id_required');

  const transportFlag = String(env.HOW_WBS_LLM_QUEUE_TRANSPORT || '')
    .trim()
    .toLowerCase();
  const useMemory =
    transportFlag === 'memory' ||
    (isWbsLlmJobMemoryStore(env) && transportFlag !== 'rabbit');

  if (useMemory) {
    for (const fn of memorySubscribers) {
      try {
        fn(body);
      } catch (err) {
        console.warn('[wbs-llm-pub] memory sub', err?.message || err);
      }
    }
    return { ok: true, transport: 'memory', queue: 'memory' };
  }

  const queue = resolveWbsLlmQueueName(env);
  const ch = await getChannel(env);
  ch.sendToQueue(queue, Buffer.from(JSON.stringify(body), 'utf8'), {
    persistent: true,
    contentType: 'application/json',
  });
  return { ok: true, transport: 'rabbit', queue };
}

async function closePublisher() {
  if (cached.conn) {
    try {
      await cached.conn.close();
    } catch {
      /* ignore */
    }
  }
  cached = { url: null, conn: null, ch: null, queue: null };
}

module.exports = {
  publishWbsLlmJob,
  subscribeMemory,
  closePublisher,
  getChannel,
};
