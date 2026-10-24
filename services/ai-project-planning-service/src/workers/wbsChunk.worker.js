#!/usr/bin/env node
/**
 * WBS chunk worker. Claims one work unit, calls the LLM, persists, then ACKs.
 * Prefetch defaults to 1 so a single Ollama slot is not oversubscribed.
 * Scale replicas for a pool. This process does not advance the planning graph.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const amqp = require('amqplib');
const { connectDB, disconnectDB } = require('@enterprise/shared');
const { assertQueuesResilient } = require('@enterprise/shared/messaging/rabbitQuorum');
const { waitForAmqpClose, sleep } = require('@enterprise/shared/messaging/rabbitReconnect');
const {
  resolveWbsChunkQueueName,
  resolveWbsChunkDlqName,
  resolveWbsChunkPrefetch,
  WBS_CHUNK_SCHEMA_VERSION,
} = require('../wbsChunk/wbsChunkContract');
const { processWbsChunk } = require('../wbsChunk/processWbsChunk');

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
        `[wbs-chunk-worker] amqp connect failed attempt=${attempt}: ${err?.message || err}; retry ${wait}ms`
      );
      await sleep(wait);
    }
  }
}

async function runSession() {
  const url = String(process.env.RABBITMQ_URL || '').trim();
  if (!url) throw new Error('RABBITMQ_URL is not set');
  if (!mongoUri) throw new Error('MONGODB_URI / AI_PROJECT_PLANNING_MONGODB_URI required');

  process.env.HOW_WBS_CHUNK_MEMORY = '0';
  process.env.HOW_WBS_CHUNK_TRANSPORT = 'rabbit';

  await connectDB(mongoUri);
  const queue = resolveWbsChunkQueueName(process.env);
  const dlq = resolveWbsChunkDlqName(process.env);
  const conn = await connectAmqpWithRetry(url);
  const ch = await assertQueuesResilient(conn, [queue, dlq]);
  await ch.prefetch(resolveWbsChunkPrefetch(process.env));
  console.log(`[wbs-chunk-worker] listening queue=${queue} prefetch=${resolveWbsChunkPrefetch(process.env)}`);

  const consume = await ch.consume(queue, async (msg) => {
    if (!msg) return;
    let workUnitId = null;
    try {
      const payload = JSON.parse(msg.content.toString('utf8'));
      if (payload.schemaVersion && payload.schemaVersion !== WBS_CHUNK_SCHEMA_VERSION) {
        throw new Error(`schema_mismatch:${payload.schemaVersion}`);
      }
      workUnitId = payload.workUnitId;
      const out = await processWbsChunk(workUnitId, {
        env: process.env,
        messageSnapshotId: payload.inputSnapshotId,
      });
      console.info(
        `[wbs-chunk-worker] done id=${workUnitId} ok=${out.ok} err=${out.error || '-'}`
      );
      ch.ack(msg);
    } catch (err) {
      console.error(`[wbs-chunk-worker] fail id=${workUnitId}`, err?.message || err);
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
      console.error('[wbs-chunk-worker] session ended', err?.message || err);
    }
    await sleep(2000);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[wbs-chunk-worker] fatal', err);
    process.exit(1);
  });
}

module.exports = { runSession };
