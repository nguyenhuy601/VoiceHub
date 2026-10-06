/**
 * Wave M — HOW WBS LLM queue contract.
 * M1: enqueue + await in WbsTool. Default QUEUE off → Wave L in-process.
 */

const {
  isHowWbsLlmFlagOn,
  resolveWbsLlmTimeoutMs,
} = require('./howWbsLlmContract');

const HOW_WBS_LLM_QUEUE_SHAPE = 'how-wbs-llm-queue-v1';
const WBS_LLM_JOB_STATUSES = Object.freeze([
  'queued',
  'running',
  'succeeded',
  'failed',
]);
const DEFAULT_QUEUE_NAME = 'ai.planning.wbs_llm';
const DEFAULT_JOB_POLL_MS = 500;

function flagOn(raw, defaultOff = true) {
  const flag = String(raw ?? (defaultOff ? '0' : '1')).trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(flag);
}

/** Queue path only when LLM WBS + queue flags on. */
function isHowWbsLlmQueueEnabled(env = process.env) {
  return isHowWbsLlmFlagOn(env) && flagOn(env.HOW_WBS_LLM_QUEUE, true);
}

function resolveWbsLlmQueueName(env = process.env) {
  return (
    String(env.RABBITMQ_WBS_LLM_QUEUE || DEFAULT_QUEUE_NAME).trim() ||
    DEFAULT_QUEUE_NAME
  );
}

function resolveWbsLlmJobTimeoutMs(env = process.env) {
  const n = Number(env.HOW_WBS_LLM_JOB_TIMEOUT_MS);
  // Chunked WBS LLM (12× ~3min) needs up to ~40 min wall
  if (Number.isFinite(n) && n >= 10000) return Math.min(2_400_000, Math.round(n));
  return resolveWbsLlmTimeoutMs(env) + 15000;
}

function resolveWbsLlmJobPollMs(env = process.env) {
  const n = Number(env.HOW_WBS_LLM_JOB_POLL_MS);
  if (Number.isFinite(n) && n >= 100) return Math.min(5000, Math.round(n));
  return DEFAULT_JOB_POLL_MS;
}

/** Unit tests / no Mongo: in-memory job map. */
function isWbsLlmJobMemoryStore(env = process.env) {
  return flagOn(env.HOW_WBS_LLM_JOB_MEMORY, true);
}

module.exports = {
  HOW_WBS_LLM_QUEUE_SHAPE,
  WBS_LLM_JOB_STATUSES,
  DEFAULT_QUEUE_NAME,
  isHowWbsLlmQueueEnabled,
  resolveWbsLlmQueueName,
  resolveWbsLlmJobTimeoutMs,
  resolveWbsLlmJobPollMs,
  isWbsLlmJobMemoryStore,
};
