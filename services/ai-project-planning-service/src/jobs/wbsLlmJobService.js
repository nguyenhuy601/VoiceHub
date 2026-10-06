/**
 * Wave M — WBS LLM job lifecycle (memory | Mongo).
 */

const { randomUUID } = require('crypto');
const {
  isWbsLlmJobMemoryStore,
  resolveWbsLlmJobTimeoutMs,
  resolveWbsLlmJobPollMs,
} = require('../contracts/howWbsLlmQueueContract');

/** @type {Map<string, object>} */
const memoryJobs = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPublic(job) {
  if (!job) return null;
  const id = String(job._id || job.id);
  return {
    id,
    runId: job.runId || null,
    generationId: job.generationId || null,
    idempotencyKey: job.idempotencyKey,
    status: job.status,
    input: job.input || null,
    result: job.result || null,
    error: job.error || null,
    attempts: job.attempts || 0,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
  };
}

function buildIdempotencyKey({ runId, generationId, attempt }) {
  const r = String(runId || 'norun').trim() || 'norun';
  const g = String(generationId || r).trim() || r;
  const a = Number.isFinite(Number(attempt)) ? Number(attempt) : 0;
  return `wbs-llm:${r}:${g}:${a}`;
}

async function createJob(payload = {}, env = process.env) {
  const idempotencyKey =
    payload.idempotencyKey ||
    buildIdempotencyKey({
      runId: payload.runId,
      generationId: payload.generationId,
      attempt: payload.attempt,
    });

  if (isWbsLlmJobMemoryStore(env)) {
    const existing = [...memoryJobs.values()].find(
      (j) => j.idempotencyKey === idempotencyKey
    );
    if (
      existing &&
      (existing.status === 'queued' ||
        existing.status === 'running' ||
        existing.status === 'succeeded')
    ) {
      return toPublic(existing);
    }
    const id = randomUUID();
    const job = {
      _id: id,
      id,
      runId: payload.runId || null,
      generationId: payload.generationId || null,
      idempotencyKey:
        existing?.status === 'failed'
          ? `${idempotencyKey}:retry:${Date.now()}`
          : idempotencyKey,
      status: 'queued',
      input: payload.input || null,
      result: null,
      error: null,
      attempts: 0,
      startedAt: null,
      finishedAt: null,
    };
    memoryJobs.set(id, job);
    return toPublic(job);
  }

  const WbsLlmJob = require('./WbsLlmJob.model');
  const existing = await WbsLlmJob.findOne({ idempotencyKey }).lean();
  if (existing) {
    // Reuse only in-flight / success — never replay a failed job (blocks LLM retry)
    if (existing.status === 'queued' || existing.status === 'running' || existing.status === 'succeeded') {
      return toPublic(existing);
    }
    // failed → new attempt key
    const retryKey = `${idempotencyKey}:retry:${Date.now()}`;
    const doc = await WbsLlmJob.create({
      runId: payload.runId || null,
      generationId: payload.generationId || null,
      idempotencyKey: retryKey,
      status: 'queued',
      input: payload.input || null,
    });
    return toPublic(doc.toObject ? doc.toObject() : doc);
  }
  try {
    const doc = await WbsLlmJob.create({
      runId: payload.runId || null,
      generationId: payload.generationId || null,
      idempotencyKey,
      status: 'queued',
      input: payload.input || null,
    });
    return toPublic(doc.toObject ? doc.toObject() : doc);
  } catch (err) {
    if (err?.code === 11000) {
      const again = await WbsLlmJob.findOne({ idempotencyKey }).lean();
      if (again) return toPublic(again);
    }
    throw err;
  }
}

async function getJob(jobId, env = process.env) {
  const id = String(jobId || '').trim();
  if (!id) return null;
  if (isWbsLlmJobMemoryStore(env)) {
    return toPublic(memoryJobs.get(id) || null);
  }
  const WbsLlmJob = require('./WbsLlmJob.model');
  const doc = await WbsLlmJob.findById(id).lean();
  return toPublic(doc);
}

async function claimJob(jobId, env = process.env) {
  const id = String(jobId || '').trim();
  const staleMs = Math.max(
    60000,
    Number(env.HOW_WBS_LLM_JOB_STALE_MS) || resolveWbsLlmJobTimeoutMs(env)
  );
  if (isWbsLlmJobMemoryStore(env)) {
    const job = memoryJobs.get(id);
    if (!job) return null;
    if (job.status === 'queued') {
      job.status = 'running';
      job.attempts = (job.attempts || 0) + 1;
      job.startedAt = new Date();
      return toPublic(job);
    }
    // Reclaim stale running (worker crash / redelivery)
    if (
      job.status === 'running' &&
      job.startedAt &&
      Date.now() - new Date(job.startedAt).getTime() > staleMs
    ) {
      job.attempts = (job.attempts || 0) + 1;
      job.startedAt = new Date();
      return toPublic(job);
    }
    return null;
  }
  const WbsLlmJob = require('./WbsLlmJob.model');
  const fresh = await WbsLlmJob.findOneAndUpdate(
    { _id: id, status: 'queued' },
    {
      $set: { status: 'running', startedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true }
  ).lean();
  if (fresh) return toPublic(fresh);

  const staleBefore = new Date(Date.now() - staleMs);
  const reclaimed = await WbsLlmJob.findOneAndUpdate(
    { _id: id, status: 'running', startedAt: { $lte: staleBefore } },
    {
      $set: { status: 'running', startedAt: new Date() },
      $inc: { attempts: 1 },
    },
    { new: true }
  ).lean();
  return toPublic(reclaimed);
}

async function completeJob(jobId, result, env = process.env) {
  const id = String(jobId || '').trim();
  if (isWbsLlmJobMemoryStore(env)) {
    const job = memoryJobs.get(id);
    if (!job) return null;
    job.status = 'succeeded';
    job.result = result || null;
    job.error = null;
    job.finishedAt = new Date();
    return toPublic(job);
  }
  const WbsLlmJob = require('./WbsLlmJob.model');
  const doc = await WbsLlmJob.findOneAndUpdate(
    { _id: id, status: { $in: ['queued', 'running'] } },
    {
      $set: {
        status: 'succeeded',
        result: result || null,
        error: null,
        finishedAt: new Date(),
      },
    },
    { new: true }
  ).lean();
  return toPublic(doc);
}

async function failJob(jobId, error, env = process.env, result = null) {
  const id = String(jobId || '').trim();
  const msg = String(error || 'failed').slice(0, 512);
  if (isWbsLlmJobMemoryStore(env)) {
    const job = memoryJobs.get(id);
    if (!job) return null;
    job.status = 'failed';
    job.error = msg;
    if (result != null) job.result = result;
    job.finishedAt = new Date();
    return toPublic(job);
  }
  const WbsLlmJob = require('./WbsLlmJob.model');
  const doc = await WbsLlmJob.findOneAndUpdate(
    { _id: id, status: { $in: ['queued', 'running'] } },
    {
      $set: {
        status: 'failed',
        error: msg,
        ...(result != null ? { result } : {}),
        finishedAt: new Date(),
      },
    },
    { new: true }
  ).lean();
  return toPublic(doc);
}

/**
 * Poll until terminal or timeout.
 * @returns {Promise<{ job: object|null, timedOut: boolean }>}
 */
async function waitForJob(jobId, env = process.env) {
  const timeoutMs = resolveWbsLlmJobTimeoutMs(env);
  const pollMs = resolveWbsLlmJobPollMs(env);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getJob(jobId, env);
    if (!job) return { job: null, timedOut: false };
    if (job.status === 'succeeded' || job.status === 'failed') {
      return { job, timedOut: false };
    }
    await sleep(pollMs);
  }
  const last = await getJob(jobId, env);
  return { job: last, timedOut: true };
}

function resetMemoryJobsForTests() {
  memoryJobs.clear();
}

module.exports = {
  buildIdempotencyKey,
  createJob,
  getJob,
  claimJob,
  completeJob,
  failJob,
  waitForJob,
  resetMemoryJobsForTests,
  toPublic,
};
