/**
 * Create store row + publish. Non-blocking for model (RULE-LLM-12).
 * Returns jobId only after store write; publish failure → publish_failed but jobId kept in wave.
 */

const { createLlmJob, markQueued, markPublishFailed, findByKey } = require('./llmJobStore');
const { publishLlmJob } = require('./llmJobPublisher');
const { LLM_JOB_SCHEMA_VERSION, defaultGeneration } = require('./llmJobContract');

/**
 * @param {object} input
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Promise<{ jobId: string, status: string, reused?: boolean }>}
 */
async function enqueueLlmJob(input, env = process.env) {
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey) {
    const err = new Error('llm_job_idempotency_required');
    err.code = 'LLM_JOB_IDEMPOTENCY_REQUIRED';
    throw err;
  }

  const existing = await findByKey(idempotencyKey, env);
  if (existing && (existing.status === 'queued' || existing.status === 'running' || existing.status === 'succeeded')) {
    return { jobId: existing.jobId, status: existing.status, reused: true };
  }

  const job = await createLlmJob(
    {
      jobType: input.jobType,
      phase: input.phase,
      runId: input.runId,
      snapshotId: input.snapshotId,
      stepId: input.stepId,
      waveId: input.waveId,
      toolName: input.toolName,
      inputVersion: input.inputVersion,
      contextRef: input.contextRef,
      factsRef: input.factsRef,
      allowedSources: input.allowedSources,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion || LLM_JOB_SCHEMA_VERSION,
      idempotencyKey,
      generation: input.generation || defaultGeneration(env),
      execution: input.execution,
      payload: input.payload || null,
      maxAttempts: input.maxAttempts,
      jobId: existing?.jobId,
    },
    env
  );

  try {
    await publishLlmJob(job, env);
    await markQueued(job.jobId, env);
    return { jobId: job.jobId, status: 'queued', reused: Boolean(existing) };
  } catch (err) {
    await markPublishFailed(job.jobId, err?.message || err, env);
    return { jobId: job.jobId, status: 'publish_failed', error: String(err?.message || err) };
  }
}

/**
 * @param {object[]} inputs
 * @param {NodeJS.ProcessEnv} [env]
 */
async function enqueueLlmJobBatch(inputs, env = process.env) {
  const list = Array.isArray(inputs) ? inputs : [];
  const out = [];
  for (const row of list) {
    out.push(await enqueueLlmJob(row, env));
  }
  return out;
}

module.exports = {
  enqueueLlmJob,
  enqueueLlmJobBatch,
};
