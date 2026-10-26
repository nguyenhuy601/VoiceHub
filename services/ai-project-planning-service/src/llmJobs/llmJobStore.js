/**
 * LlmJob store — memory map for tests; Mongo when LLM_JOBS_MEMORY=0.
 */

const { randomUUID } = require('crypto');
const {
  isLlmJobsMemoryStore,
  resolveLlmJobsMaxAttempts,
  resolveLlmJobsLeaseMs,
  LLM_JOB_SCHEMA_VERSION,
  defaultGeneration,
  JOB_TYPE_WHITELIST,
  TERMINAL_LLM_JOB_STATUSES,
} = require('./llmJobContract');

/** @type {Map<string, object>} */
const memoryJobs = new Map();

function resetLlmJobsForTests() {
  memoryJobs.clear();
}

function clone(job) {
  if (!job) return null;
  return {
    jobId: job.jobId,
    runId: job.runId || null,
    snapshotId: job.snapshotId || null,
    stepId: job.stepId || null,
    jobType: job.jobType,
    phase: job.phase || null,
    status: job.status,
    attempt: job.attempt || 0,
    maxAttempts: job.maxAttempts,
    inputVersion: job.inputVersion || null,
    contextRef: job.contextRef || null,
    factsRef: job.factsRef || null,
    allowedSources: Array.isArray(job.allowedSources) ? [...job.allowedSources] : [],
    promptVersion: job.promptVersion || null,
    schemaVersion: job.schemaVersion || LLM_JOB_SCHEMA_VERSION,
    idempotencyKey: job.idempotencyKey,
    waveId: job.waveId || null,
    toolName: job.toolName || null,
    generation: job.generation || null,
    execution: job.execution || null,
    payload: job.payload || null,
    result: job.result || null,
    error: job.error || null,
    startedAt: job.startedAt || null,
    completedAt: job.completedAt || null,
    leaseUntil: job.leaseUntil || null,
  };
}

function findMemoryByKey(idempotencyKey) {
  for (const job of memoryJobs.values()) {
    if (job.idempotencyKey === idempotencyKey) return job;
  }
  return null;
}

async function findByKey(idempotencyKey, env) {
  if (isLlmJobsMemoryStore(env)) return clone(findMemoryByKey(idempotencyKey));
  const LlmJob = require('./LlmJob.model');
  const doc = await LlmJob.findOne({ idempotencyKey }).lean();
  return clone(doc);
}

/**
 * Create pending job once. Same idempotencyKey returns existing.
 * @param {object} payload
 * @param {NodeJS.ProcessEnv} [env]
 */
async function createLlmJob(payload, env = process.env) {
  const idempotencyKey = String(payload.idempotencyKey || '').trim();
  if (!idempotencyKey) throw new Error('llm_job_idempotency_required');
  const jobType = String(payload.jobType || '').trim();
  if (!JOB_TYPE_WHITELIST.includes(jobType)) {
    const err = new Error(`llm_job_type_forbidden:${jobType}`);
    err.code = 'LLM_JOB_TYPE_FORBIDDEN';
    throw err;
  }

  const existing = await findByKey(idempotencyKey, env);
  if (existing) return existing;

  const job = {
    jobId: payload.jobId || `llm-${randomUUID()}`,
    runId: payload.runId ? String(payload.runId).trim() : null,
    snapshotId: payload.snapshotId ? String(payload.snapshotId).trim() : null,
    stepId: payload.stepId || null,
    jobType,
    phase: payload.phase === 'WHAT' || payload.phase === 'HOW' ? payload.phase : null,
    status: 'pending',
    attempt: 0,
    maxAttempts: payload.maxAttempts || resolveLlmJobsMaxAttempts(env),
    inputVersion: payload.inputVersion || null,
    contextRef: payload.contextRef || null,
    factsRef: payload.factsRef || null,
    allowedSources: Array.isArray(payload.allowedSources) ? payload.allowedSources : [],
    promptVersion: payload.promptVersion || null,
    schemaVersion: payload.schemaVersion || LLM_JOB_SCHEMA_VERSION,
    idempotencyKey,
    waveId: payload.waveId || null,
    toolName: payload.toolName || null,
    generation: payload.generation || defaultGeneration(env),
    execution: payload.execution || {
      maxAttempts: resolveLlmJobsMaxAttempts(env),
      requestTimeoutMs: Number(env.LLM_JOBS_REQUEST_TIMEOUT_MS) || 120000,
      queue: true,
    },
    payload: payload.payload || null,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
    leaseUntil: null,
  };

  if (isLlmJobsMemoryStore(env)) {
    const raced = findMemoryByKey(idempotencyKey);
    if (raced) return clone(raced);
    memoryJobs.set(job.jobId, job);
    return clone(job);
  }

  const LlmJob = require('./LlmJob.model');
  try {
    const doc = await LlmJob.create(job);
    return clone(doc.toObject());
  } catch (err) {
    if (err?.code === 11000) {
      const again = await findByKey(idempotencyKey, env);
      if (again) return again;
    }
    throw err;
  }
}

async function getLlmJob(jobId, env = process.env) {
  const id = String(jobId || '').trim();
  if (!id) return null;
  if (isLlmJobsMemoryStore(env)) return clone(memoryJobs.get(id) || null);
  const LlmJob = require('./LlmJob.model');
  const doc = await LlmJob.findOne({ jobId: id }).lean();
  return clone(doc);
}

async function listLlmJobsByIds(jobIds, env = process.env) {
  const ids = (Array.isArray(jobIds) ? jobIds : []).map((id) => String(id || '').trim()).filter(Boolean);
  if (!ids.length) return [];
  if (isLlmJobsMemoryStore(env)) {
    return ids.map((id) => clone(memoryJobs.get(id))).filter(Boolean);
  }
  const LlmJob = require('./LlmJob.model');
  const docs = await LlmJob.find({ jobId: { $in: ids } }).lean();
  const byId = new Map(docs.map((d) => [d.jobId, clone(d)]));
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

async function updateJob(jobId, env, mutate) {
  if (isLlmJobsMemoryStore(env)) {
    const job = memoryJobs.get(jobId);
    if (!job) return null;
    mutate(job);
    return clone(job);
  }
  const LlmJob = require('./LlmJob.model');
  const current = await LlmJob.findOne({ jobId }).lean();
  if (!current) return null;
  const next = { ...current };
  mutate(next);
  const { jobId: _id, ...rest } = next;
  await LlmJob.updateOne({ jobId }, { $set: rest });
  return clone(next);
}

async function markQueued(jobId, env = process.env) {
  return updateJob(jobId, env, (job) => {
    if (TERMINAL_LLM_JOB_STATUSES.includes(job.status)) return;
    job.status = 'queued';
  });
}

async function markPublishFailed(jobId, error, env = process.env) {
  return updateJob(jobId, env, (job) => {
    job.status = 'publish_failed';
    job.error = String(error || 'publish_failed').slice(0, 512);
    job.completedAt = new Date();
  });
}

async function claimLlmJob(jobId, env = process.env) {
  const leaseUntil = new Date(Date.now() + resolveLlmJobsLeaseMs(env));
  return updateJob(jobId, env, (job) => {
    if (job.status !== 'queued' && job.status !== 'pending') {
      if (job.status === 'running' && job.leaseUntil && new Date(job.leaseUntil) < new Date()) {
        /* expired lease — reclaim */
      } else if (job.status === 'running') {
        return;
      } else if (TERMINAL_LLM_JOB_STATUSES.includes(job.status)) {
        return;
      }
    }
    job.status = 'running';
    job.attempt = (job.attempt || 0) + 1;
    job.startedAt = job.startedAt || new Date();
    job.leaseUntil = leaseUntil;
    job.error = null;
  });
}

async function completeLlmJob(jobId, result, env = process.env) {
  return updateJob(jobId, env, (job) => {
    job.status = 'succeeded';
    job.result = result;
    job.completedAt = new Date();
    job.leaseUntil = null;
    job.error = null;
  });
}

async function failLlmJob(jobId, error, env = process.env, opts = {}) {
  const dead = opts.deadLetter === true;
  return updateJob(jobId, env, (job) => {
    const max = job.maxAttempts || resolveLlmJobsMaxAttempts(env);
    const attempts = job.attempt || 0;
    if (dead || attempts >= max) {
      job.status = dead ? 'dead_letter' : 'failed';
    } else {
      job.status = 'failed';
    }
    job.error = String(error || 'failed').slice(0, 512);
    job.completedAt = new Date();
    job.leaseUntil = null;
  });
}

function isTerminalStatus(status) {
  return TERMINAL_LLM_JOB_STATUSES.includes(status);
}

function isInFlightStatus(status) {
  return status === 'pending' || status === 'queued' || status === 'running';
}

module.exports = {
  resetLlmJobsForTests,
  createLlmJob,
  getLlmJob,
  listLlmJobsByIds,
  findByKey,
  markQueued,
  markPublishFailed,
  claimLlmJob,
  completeLlmJob,
  failLlmJob,
  isTerminalStatus,
  isInFlightStatus,
};
