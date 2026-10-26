/**
 * Shared LlmJob contract — WHAT + HOW (RULE-LLM-07).
 * Generation SoT: DashScope openai_compatible (RULE-LLM-04).
 *
 * Cutover flags (default off in production until smoke):
 * - LLM_JOBS_ENABLED=0|1 — master switch for tool enqueue path
 * - LLM_JOBS_INLINE=1 — force inline generateJson (dev)
 * - LLM_JOBS_TYPES=*|comma list|what.fr.*|how.*|what.*
 * - LLM_JOBS_WBS — optional kill-switch only (unset/1 = WBS on shared queue like other jobs; 0 = legacy wbs_chunk)
 * - LLM_JOBS_QUEUE=ai.planning.llm_jobs — shared with llmJobs.worker
 * - WAVE_TIMEOUT_MS — awaitWave wall clock
 */

const LLM_JOB_SCHEMA_VERSION = 'llm-job-v1';
const DEFAULT_QUEUE_NAME = 'ai.planning.llm_jobs';
const DEFAULT_DLQ_NAME = 'ai.planning.llm_jobs.dlq';

const JOB_TYPES = Object.freeze({
  WBS_CHUNK: 'wbs.generate.chunk',
  HOW_DEPENDENCY: 'how.dependency.generate',
  HOW_RISK: 'how.risk.generate',
  HOW_QUALITY: 'how.quality.generate',
  WHAT_SECTION_DERIVE: 'what.section.derive',
  WHAT_FR_SEMANTIC: 'what.fr.semantic',
  WHAT_FR_CONFLICT: 'what.fr.conflict',
  WHAT_FR_SYNTHESIS: 'what.fr.synthesis',
});

const JOB_TYPE_WHITELIST = Object.freeze(Object.values(JOB_TYPES));

const LLM_JOB_STATUSES = Object.freeze([
  'pending',
  'queued',
  'running',
  'succeeded',
  'failed',
  'publish_failed',
  'dead_letter',
]);

const TERMINAL_LLM_JOB_STATUSES = Object.freeze([
  'succeeded',
  'failed',
  'publish_failed',
  'dead_letter',
]);

const DEFAULT_GENERATION = Object.freeze({
  provider: 'dashscope',
  apiStyle: 'openai_compatible',
});

function flagOn(raw, defaultOff = true) {
  const flag = String(raw ?? (defaultOff ? '0' : '1')).trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(flag);
}

function isLlmJobsEnabled(env = process.env) {
  return flagOn(env.LLM_JOBS_ENABLED, true);
}

function isLlmJobsInline(env = process.env) {
  return flagOn(env.LLM_JOBS_INLINE, true);
}

/**
 * WBS is a normal jobType (same as risk/derive) when LLM_JOBS is on.
 * Explicit opt-out only: LLM_JOBS_WBS=0 keeps legacy wbs_chunk worker/queue.
 */
function isLlmJobsWbsEnabled(env = process.env) {
  if (env.LLM_JOBS_WBS === undefined || String(env.LLM_JOBS_WBS).trim() === '') {
    return true;
  }
  return flagOn(env.LLM_JOBS_WBS, false);
}

function resolveLlmJobsTransport(env = process.env) {
  const raw = String(env.LLM_JOBS_TRANSPORT || 'memory').trim().toLowerCase();
  return raw === 'rabbit' ? 'rabbit' : 'memory';
}

function isLlmJobsMemoryStore(env = process.env) {
  return flagOn(env.LLM_JOBS_MEMORY, false) || resolveLlmJobsTransport(env) === 'memory';
}

function resolveLlmJobsQueueName(env = process.env) {
  return String(env.LLM_JOBS_QUEUE || DEFAULT_QUEUE_NAME).trim() || DEFAULT_QUEUE_NAME;
}

function resolveLlmJobsDlqName(env = process.env) {
  return String(env.LLM_JOBS_DLQ || DEFAULT_DLQ_NAME).trim() || DEFAULT_DLQ_NAME;
}

function resolveLlmJobsMaxAttempts(env = process.env) {
  const n = Number(env.LLM_JOBS_MAX_ATTEMPTS);
  if (Number.isFinite(n) && n >= 1) return Math.min(5, Math.round(n));
  return 3;
}

function resolveLlmJobsPollMs(env = process.env) {
  const n = Number(env.LLM_JOBS_POLL_MS);
  if (Number.isFinite(n) && n >= 50) return Math.min(5000, Math.round(n));
  return 100;
}

function resolveWaveTimeoutMs(env = process.env) {
  const n = Number(env.WAVE_TIMEOUT_MS || env.LLM_JOBS_WAVE_TIMEOUT_MS);
  if (Number.isFinite(n) && n >= 50) return Math.min(2_400_000, Math.round(n));
  return 120_000;
}

function resolveLlmJobsConcurrency(env = process.env) {
  const n = Number(env.LLM_JOBS_CONCURRENCY);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return 2;
}

function resolveLlmJobsPrefetch(env = process.env) {
  const n = Number(env.LLM_JOBS_PREFETCH);
  if (Number.isFinite(n) && n >= 1) return Math.min(8, Math.round(n));
  return 1;
}

function resolveLlmJobsLeaseMs(env = process.env) {
  const n = Number(env.LLM_JOBS_LEASE_MS);
  if (Number.isFinite(n) && n >= 1000) return Math.round(n);
  return 180_000;
}

/**
 * @param {string} jobType
 * @param {NodeJS.ProcessEnv} [env]
 */
function isJobTypeEnabled(jobType, env = process.env) {
  if (!isLlmJobsEnabled(env)) return false;
  if (isLlmJobsInline(env)) return false;
  const type = String(jobType || '').trim();
  if (!JOB_TYPE_WHITELIST.includes(type)) return false;
  if (type === JOB_TYPES.WBS_CHUNK && !isLlmJobsWbsEnabled(env)) return false;
  const raw = String(env.LLM_JOBS_TYPES || '*').trim();
  if (!raw || raw === '*') return true;
  const allowed = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
  if (allowed.includes(type)) return true;
  if (allowed.includes('what.fr.*') && type.startsWith('what.fr.')) return true;
  if (allowed.includes('how.*') && type.startsWith('how.')) return true;
  if (allowed.includes('what.*') && type.startsWith('what.')) return true;
  return false;
}

/**
 * Queue body is routing only — no SRS dump (RULE §2.6).
 * @param {object} job
 */
function buildLlmJobQueueMessage(job) {
  return {
    jobId: job.jobId,
    jobType: job.jobType,
    runId: job.runId || null,
    snapshotId: job.snapshotId || null,
    attempt: Number(job.attempt) || 0,
    schemaVersion: job.schemaVersion || LLM_JOB_SCHEMA_VERSION,
  };
}

function defaultGeneration(env = process.env) {
  return {
    ...DEFAULT_GENERATION,
    model: String(env.LLM_CHAT_MODEL || env.DASHSCOPE_MODEL || '').trim() || null,
    maxOutputTokens: Number(env.LLM_JOBS_MAX_OUTPUT_TOKENS) || 4096,
    temperature: Number(env.LLM_JOBS_TEMPERATURE) || 0.2,
  };
}

module.exports = {
  LLM_JOB_SCHEMA_VERSION,
  DEFAULT_QUEUE_NAME,
  DEFAULT_DLQ_NAME,
  JOB_TYPES,
  JOB_TYPE_WHITELIST,
  LLM_JOB_STATUSES,
  TERMINAL_LLM_JOB_STATUSES,
  DEFAULT_GENERATION,
  isLlmJobsEnabled,
  isLlmJobsInline,
  isLlmJobsWbsEnabled,
  resolveLlmJobsTransport,
  isLlmJobsMemoryStore,
  resolveLlmJobsQueueName,
  resolveLlmJobsDlqName,
  resolveLlmJobsMaxAttempts,
  resolveLlmJobsPollMs,
  resolveWaveTimeoutMs,
  resolveLlmJobsConcurrency,
  resolveLlmJobsPrefetch,
  resolveLlmJobsLeaseMs,
  isJobTypeEnabled,
  buildLlmJobQueueMessage,
  defaultGeneration,
};
