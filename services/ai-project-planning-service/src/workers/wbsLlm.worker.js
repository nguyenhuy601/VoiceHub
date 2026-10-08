#!/usr/bin/env node
/**
 * Wave M — WBS LLM queue worker (APS image, WORKER_ROLE=wbs_llm).
 * Prefetch 1 — matches OLLAMA_NUM_PARALLEL=1.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const amqp = require('amqplib');
const {
  connectDB,
  disconnectDB,
} = require('@enterprise/shared');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const { waitForAmqpClose, sleep } = require('@enterprise/shared/messaging/rabbitReconnect');
const {
  resolveWbsLlmQueueName,
} = require('../contracts/howWbsLlmQueueContract');
const { processWbsLlmJob } = require('../jobs/processWbsLlmJob');

const mongoUri =
  (process.env.AI_PROJECT_PLANNING_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

async function connectAmqpWithRetry(url) {
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await amqp.connect(url);
    } catch (err) {
      const wait = Math.min(30000, 1000 * attempt);
      console.error(
        `[wbs-llm-worker] amqp connect failed attempt=${attempt}: ${err?.message || err}; retry ${wait}ms`
      );
      await sleep(wait);
    }
  }
}

async function runSession() {
  const url = String(process.env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL is not set');
  if (!mongoUri) throw new Error('MONGODB_URI / AI_PROJECT_PLANNING_MONGODB_URI required');

  // Worker uses real Mongo (not memory store)
  process.env.HOW_WBS_LLM_JOB_MEMORY = '0';

  await connectDB(mongoUri);
  const queue = resolveWbsLlmQueueName(process.env);
  const conn = await connectAmqpWithRetry(url);
  const ch = await assertQueuesResilient(conn, [queue]);
  await ch.prefetch(1);

  console.log(`[wbs-llm-worker] listening queue=${queue}`);

  const consume = await ch.consume(queue, async (msg) => {
    if (!msg) return;
    let jobId = null;
    try {
      const payload = JSON.parse(msg.content.toString('utf8'));
      jobId = payload.jobId;
      console.info(`[wbs-llm-worker] job start id=${jobId}`);
      const out = await processWbsLlmJob(jobId, { env: process.env });
      console.info(
        `[wbs-llm-worker] job done id=${jobId} ok=${out.ok} err=${out.error || '-'}`
      );
      ch.ack(msg);
    } catch (err) {
      console.error(`[wbs-llm-worker] job fail id=${jobId}`, err?.message || err);
      try {
        ch.nack(msg, false, false);
      } catch {
        /* ignore */
      }
    }
  });

  await waitForAmqpClose(conn);
  try {
    await ch.cancel(consume.consumerTag);
  } catch {
    /* ignore */
  }
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
  try {
    await disconnectDB();
  } catch {
    /* ignore */
  }
}

async function main() {
  for (;;) {
    try {
      await runSession();
    } catch (err) {
      console.error('[wbs-llm-worker] session ended', err?.message || err);
    }
    await sleep(2000);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[wbs-llm-worker] fatal', err);
    process.exit(1);
  });
}

module.exports = { runSession };
