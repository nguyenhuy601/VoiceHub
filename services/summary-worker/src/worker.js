const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const amqp = require('amqplib');
const { assertQuorumQueue } = require('@enterprise/shared/messaging/rabbitQuorum');
const { waitForAmqpClose, sleep } = require('@enterprise/shared/messaging/rabbitReconnect');
const { connectDB, disconnectDB } = require('@enterprise/shared');
const ConversationSummary = require('./models/ConversationSummary');
const {
  CONVERSATION_SUMMARY_GENERATE_QUEUE,
  CONVERSATION_SUMMARY_DLQ_QUEUE,
  buildSummaryPrompt,
  fetchOrgThreadExport,
  safeParseJsonFromOllama,
  callOllama,
  normalizeResult,
  sanitizeWorkerErrorMessage,
} = require('./promptBuilder');

const GENERATE_QUEUE =
  process.env.RABBITMQ_SUMMARY_GENERATE_QUEUE || CONVERSATION_SUMMARY_GENERATE_QUEUE;
const DLQ_QUEUE = process.env.RABBITMQ_SUMMARY_DLQ_QUEUE || CONVERSATION_SUMMARY_DLQ_QUEUE;
const MAX_JOB_RETRIES = Math.max(0, parseInt(process.env.SUMMARY_JOB_MAX_RETRIES || '8', 10) || 8);

async function processSummaryJob(payload) {
  const summaryId = String(payload?.summaryId || '');
  if (!summaryId) throw new Error('Missing summaryId');

  const locked = await ConversationSummary.findOneAndUpdate(
    { _id: summaryId, status: 'queued' },
    { $set: { status: 'processing', error: '' } },
    { new: true }
  );
  if (!locked) {
    const existing = await ConversationSummary.findById(summaryId).lean();
    if (existing?.status === 'ready') return;
    throw new Error(`Summary ${summaryId} not in queued state`);
  }

  const { organizationId, roomId, generatedBy, options } = payload;
  const exportData = await fetchOrgThreadExport({
    organizationId,
    roomId,
    generatedBy,
    options: options || locked.options,
  });

  if (!exportData?.messageCount) {
    await ConversationSummary.findByIdAndUpdate(summaryId, {
      $set: { status: 'failed', error: 'No messages to summarize' },
    });
    return;
  }

  const prompt = buildSummaryPrompt({
    messages: exportData.messages,
    organizationId,
    roomId,
  });

  const modelData = await callOllama(prompt);
  const parsed = safeParseJsonFromOllama(modelData);
  const result = normalizeResult(parsed, exportData);

  if (!result.overview) {
    throw new Error('Invalid summary: missing overview');
  }

  const provider = String(process.env.LLM_PROVIDER || 'ollama').toLowerCase();
  const model = process.env.OLLAMA_MODEL || 'qwen2.5:3b-instruct';

  await ConversationSummary.findByIdAndUpdate(summaryId, {
    $set: {
      status: 'ready',
      error: '',
      result,
      sourceMeta: {
        messageCount: exportData.messageCount,
        firstMessageId: exportData.firstMessageId || '',
        lastMessageId: exportData.lastMessageId || '',
        exportedAt: exportData.exportedAt || new Date(),
      },
      modelMeta: {
        provider,
        model: provider === 'mock' ? 'mock' : model,
        promptTokensApprox: Math.ceil(prompt.length / 4),
      },
      rawModelOutput: modelData,
    },
  });
}

function getRetryCount(msg) {
  const h = (msg && msg.properties && msg.properties.headers) || {};
  const n = h['x-retry-count'];
  if (n === undefined || n === null) return 0;
  const parsed = parseInt(String(n), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function publishToDlq(ch, sourceQueue, msg, err) {
  const body = {
    sourceQueue,
    error: String(err?.message || err),
    original: msg.content.toString('utf8'),
  };
  await assertQuorumQueue(ch, DLQ_QUEUE);
  ch.sendToQueue(DLQ_QUEUE, Buffer.from(JSON.stringify(body)), {
    persistent: true,
    contentType: 'application/json',
  });
}

function isTransientJobError(err) {
  const code = err?.code;
  if (code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNREFUSED') return true;
  const status = err?.response?.status;
  if (status >= 500) return true;
  const msg = String(err?.message || err);
  return /timeout|ETIMEDOUT|MongoNetworkError/i.test(msg);
}

function isAmqpConnectRetryable(err) {
  const code = err?.code;
  return code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ECONNRESET' || code === 'EAI_AGAIN';
}

async function connectAmqpWithRetry(url) {
  const maxAttempts = Math.max(1, parseInt(process.env.RABBITMQ_CONNECT_MAX_ATTEMPTS || '45', 10) || 45);
  const delayMs = Math.max(500, parseInt(process.env.RABBITMQ_CONNECT_RETRY_MS || '2000', 10) || 2000);
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await amqp.connect(url);
    } catch (err) {
      lastErr = err;
      if (!isAmqpConnectRetryable(err) || attempt >= maxAttempts) throw err;
      console.warn(
        `[summary-worker] RabbitMQ not ready (${attempt}/${maxAttempts}): ${err.message}`
      );
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

let shuttingDown = false;
let activeSession = null;

async function runWorkerSession() {
  const url = process.env.RABBITMQ_URL;
  if (!url) throw new Error('RABBITMQ_URL is not set');

  const conn = await connectAmqpWithRetry(url);
  const ch = await conn.createChannel();
  await assertQuorumQueue(ch, GENERATE_QUEUE);
  await assertQuorumQueue(ch, DLQ_QUEUE);
  await ch.prefetch(1);

  console.log(`[summary-worker] listening queue=${GENERATE_QUEUE}`);

  const consume = await ch.consume(
    GENERATE_QUEUE,
    async (msg) => {
      if (!msg) return;
      const retryCount = getRetryCount(msg);
      try {
        const payload = JSON.parse(msg.content.toString('utf8'));
        await processSummaryJob(payload);
        ch.ack(msg);
      } catch (err) {
        console.error('[summary-worker] job failed:', err.message);
        const summaryId = (() => {
          try {
            return JSON.parse(msg.content.toString('utf8'))?.summaryId;
          } catch {
            return null;
          }
        })();
        if (summaryId) {
          await ConversationSummary.findByIdAndUpdate(summaryId, {
            $set: {
              status: 'failed',
              error: sanitizeWorkerErrorMessage(err),
            },
          }).catch(() => null);
        }

        const transient = isTransientJobError(err);
        if (transient && retryCount < MAX_JOB_RETRIES) {
          ch.sendToQueue(GENERATE_QUEUE, msg.content, {
            persistent: true,
            contentType: 'application/json',
            headers: { 'x-retry-count': retryCount + 1 },
          });
          ch.ack(msg);
          return;
        }

        try {
          await publishToDlq(ch, GENERATE_QUEUE, msg, err);
        } catch (dlqErr) {
          console.error('[summary-worker] DLQ publish failed:', dlqErr.message);
        }
        ch.ack(msg);
      }
    },
    { noAck: false }
  );

  activeSession = { conn, ch, consumerTag: consume.consumerTag };
  await waitForAmqpClose(conn);
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const session = activeSession;
  activeSession = null;
  if (session) {
    try {
      if (session.consumerTag) await session.ch.cancel(session.consumerTag);
    } catch (e) {
      /* ignore */
    }
    try {
      await session.ch.close();
    } catch (e) {
      /* ignore */
    }
    try {
      await session.conn.close();
    } catch (e) {
      /* ignore */
    }
  }
  try {
    await disconnectDB();
  } catch (e) {
    /* ignore */
  }
  process.exit(0);
}

const mongoUri = (process.env.SUMMARY_MONGODB_URI || '').trim() || process.env.MONGODB_URI;

connectDB(mongoUri)
  .then(async () => {
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    while (!shuttingDown) {
      try {
        await runWorkerSession();
      } catch (err) {
        if (shuttingDown) break;
        console.error('[summary-worker] session ended:', err.message);
        await sleep(2000);
      }
    }
  })
  .catch((err) => {
    console.error('Failed to start summary-worker:', err);
    process.exit(1);
  });
