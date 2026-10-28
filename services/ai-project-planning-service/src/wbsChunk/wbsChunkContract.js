/**
 * WBS chunk execution contract.
 * LangGraph decides workflow; the queue only routes; the work-unit row is durable state.
 */

const WBS_CHUNK_SCHEMA_VERSION = 'wbs-task-v1';
const WBS_CHUNK_JOB_TYPE = 'WBS_GENERATE_CHUNK';
const DEFAULT_QUEUE_NAME = 'ai.planning.wbs_chunk';
const DEFAULT_DLQ_NAME = 'ai.planning.wbs_chunk.dlq';

const WBS_WORK_UNIT_STATUSES = Object.freeze([
  'PENDING',
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'RETRY_WAIT',
  'FAILED',
  'DEAD_LETTER',
]);

const TERMINAL_WORK_UNIT_STATUSES = Object.freeze([
  'SUCCEEDED',
  'FAILED',
  'DEAD_LETTER',
]);

function flagOn(raw, defaultOff = true) {
  const flag = String(raw ?? (defaultOff ? '0' : '1')).trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(flag);
}

function isWbsChunkOrchestratorEnabled(env = process.env) {
  return flagOn(env.HOW_WBS_CHUNK_ORCHESTRATOR, true);
}

/** In-process drain when transport is memory. Rabbit + LLM_JOBS_WBS → llm-jobs-worker. */
function resolveWbsChunkTransport(env = process.env) {
  const raw = String(env.HOW_WBS_CHUNK_TRANSPORT || 'memory').trim().toLowerCase();
  return raw === 'rabbit' ? 'rabbit' : 'memory';
}

function isWbsChunkMemoryStore(env = process.env) {
  return flagOn(env.HOW_WBS_CHUNK_MEMORY, false);
}

function resolveWbsChunkQueueName(env = process.env) {
  return String(env.RABBITMQ_WBS_CHUNK_QUEUE || DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
}

function resolveWbsChunkDlqName(env = process.env) {
  return String(env.RABBITMQ_WBS_CHUNK_DLQ || DEFAULT_DLQ_NAME).trim() || DEFAULT_DLQ_NAME;
}

function resolveWbsChunkConcurrency(env = process.env) {
  const n = Number(env.HOW_WBS_CHUNK_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return 2;
}

function resolveWbsChunkPrefetch(env = process.env) {
  const n = Number(env.HOW_WBS_CHUNK_PREFETCH);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return 1;
}

function resolveWbsChunkMaxAttempts(env = process.env) {
  const n = Number(env.HOW_WBS_CHUNK_MAX_ATTEMPTS);
  if (Number.isFinite(n) && n >= 1) return Math.min(5, Math.round(n));
  return 3;
}

function resolveWbsChunkPollMs(env = process.env) {
  const n = Number(env.HOW_WBS_CHUNK_POLL_MS);
  if (Number.isFinite(n) && n >= 100) return Math.min(5000, Math.round(n));
  return 500;
}

function resolveWbsChunkWaitMs(env = process.env) {
  const n = Number(env.HOW_WBS_CHUNK_WAIT_MS);
  if (Number.isFinite(n) && n >= 1000) return Math.min(2_400_000, Math.round(n));
  const { resolveWbsLlmJobTimeoutMs } = require('../contracts/howWbsLlmQueueContract');
  return resolveWbsLlmJobTimeoutMs(env);
}

function resolveWbsChunkSize(env = process.env) {
  const { resolveWbsFrPerCall } = require('../contracts/howWbsLlmContract');
  return resolveWbsFrPerCall(env);
}

/**
 * Queue body is routing only — no SRS, no employee payload.
 * @param {object} unit
 */
function buildWbsChunkQueueMessage(unit) {
  return {
    jobType: WBS_CHUNK_JOB_TYPE,
    runId: unit.runId,
    workUnitId: unit.workUnitId,
    inputSnapshotId: unit.inputSnapshotId,
    attempt: Number(unit.attempt) || 0,
    schemaVersion: unit.schemaVersion || WBS_CHUNK_SCHEMA_VERSION,
  };
}

module.exports = {
  WBS_CHUNK_SCHEMA_VERSION,
  WBS_CHUNK_JOB_TYPE,
  DEFAULT_QUEUE_NAME,
  DEFAULT_DLQ_NAME,
  WBS_WORK_UNIT_STATUSES,
  TERMINAL_WORK_UNIT_STATUSES,
  isWbsChunkOrchestratorEnabled,
  resolveWbsChunkTransport,
  isWbsChunkMemoryStore,
  resolveWbsChunkQueueName,
  resolveWbsChunkDlqName,
  resolveWbsChunkConcurrency,
  resolveWbsChunkPrefetch,
  resolveWbsChunkMaxAttempts,
  resolveWbsChunkPollMs,
  resolveWbsChunkWaitMs,
  resolveWbsChunkSize,
  buildWbsChunkQueueMessage,
};
