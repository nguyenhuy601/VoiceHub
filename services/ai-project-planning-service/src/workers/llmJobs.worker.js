#!/usr/bin/env node
/**
 * Shared LlmJob worker (WHAT + HOW). Claims one job, runs handler, ACKs.
 * Prefetch defaults to 1. Scale replicas for a pool.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const amqp = require('amqplib');
const { connectDB, disconnectDB } = require('@enterprise/shared');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const { waitForAmqpClose, sleep } = require('@enterprise/shared/messaging/rabbitReconnect');
const {
  resolveLlmJobsQueueName,
  resolveLlmJobsDlqName,
  resolveLlmJobsPrefetch,
  LLM_JOB_SCHEMA_VERSION,
} = require('../llmJobs/llmJobContract');
const { processLlmJob } = require('../llmJobs/processLlmJob');

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
        `[llm-jobs-worker] amqp connect failed attempt=${attempt}: ${err?.message || err}; retry ${wait}ms`
      );
      await sleep(wait);
    }
  }
}

async function runSession() {
  const url = String(process.env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL is not set');
  if (!mongoUri) throw new Error('MONGODB_URI / AI_PROJECT_PLANNING_MONGODB_URI required');

  process.env.LLM_JOBS_MEMORY = '0';
  process.env.LLM_JOBS_TRANSPORT = 'rabbit';

  await connectDB(mongoUri);
  const queue = resolveLlmJobsQueueName(process.env);
  const dlq = resolveLlmJobsDlqName(process.env);
  const conn = await connectAmqpWithRetry(url);
  const ch = await assertQueuesResilient(conn, [queue, dlq]);
  await ch.prefetch(resolveLlmJobsPrefetch(process.env));
  console.log(
    `[llm-jobs-worker] listening queue=${queue} prefetch=${resolveLlmJobsPrefetch(process.env)}`
  );

  const consume = await ch.consume(queue, async (msg) => {
    if (!msg) return;
    let jobId = null;
    try {
      const payload = JSON.parse(msg.content.toString('utf8'));
      if (payload.schemaVersion && payload.schemaVersion !== LLM_JOB_SCHEMA_VERSION) {
        throw new Error(`schema_mismatch:${payload.schemaVersion}`);
      }
      jobId = payload.jobId;
      const out = await processLlmJob(jobId, { env: process.env });
      console.info(
        `[llm-jobs-worker] done id=${jobId} ok=${out.ok} err=${out.error || '-'}`
      );
      ch.ack(msg);
    } catch (err) {
      console.error(`[llm-jobs-worker] fail id=${jobId}`, err?.message || err);
      const requeue = !String(err?.message || '').startsWith('schema_mismatch');
      try {
        ch.nack(msg, false, requeue);
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
  await disconnectDB();
}

async function main() {
  for (;;) {
    try {
      await runSession();
    } catch (err) {
      console.error('[llm-jobs-worker] session ended', err?.message || err);
    }
    await sleep(2000);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[llm-jobs-worker] fatal', err);
    process.exit(1);
  });
}

module.exports = { runSession };
