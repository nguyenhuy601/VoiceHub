/**
 * Claim → handler → validate → complete/fail.
 */

const {
  getLlmJob,
  claimLlmJob,
  completeLlmJob,
  failLlmJob,
} = require('./llmJobStore');
const { getHandler, handleEchoStub } = require('./handlers');
const { validateLlmResult } = require('./validateLlmResult');
const { publishLlmJobDlq } = require('./llmJobPublisher');

/**
 * @param {string} jobId
 * @param {{ env?: NodeJS.ProcessEnv, generateJsonFn?: Function, invokeFn?: Function, useEchoStub?: boolean }} [opts]
 */
async function processLlmJob(jobId, opts = {}) {
  const env = opts.env || process.env;
  const id = String(jobId || '').trim();
  if (!id) return { ok: false, error: 'job_id_required' };

  const before = await getLlmJob(id, env);
  if (!before) return { ok: false, error: 'job_not_found' };
  if (before.status === 'succeeded') return { ok: true, reused: true, result: before.result };
  if (before.status === 'failed' || before.status === 'dead_letter' || before.status === 'publish_failed') {
    return { ok: false, error: before.error || before.status, status: before.status };
  }

  const claimed = await claimLlmJob(id, env);
  if (!claimed || claimed.status !== 'running') {
    const latest = await getLlmJob(id, env);
    if (latest?.status === 'succeeded') return { ok: true, reused: true, result: latest.result };
    return { ok: false, error: 'claim_failed', status: latest?.status };
  }

  try {
    const handler =
      opts.useEchoStub === true
        ? handleEchoStub
        : getHandler(claimed.jobType) || (opts.allowEchoFallback ? handleEchoStub : null);
    if (!handler) {
      await failLlmJob(id, `no_handler:${claimed.jobType}`, env, { deadLetter: true });
      await publishLlmJobDlq(claimed, `no_handler:${claimed.jobType}`, env);
      return { ok: false, error: `no_handler:${claimed.jobType}` };
    }

    const result = await handler(claimed, {
      env,
      generateJsonFn: opts.generateJsonFn,
      invokeFn: opts.invokeFn,
    });

    const validation = validateLlmResult(result, { allowedSources: claimed.allowedSources });
    if (!validation.ok) {
      await failLlmJob(id, validation.code || 'validate_failed', env);
      return { ok: false, error: validation.code, validation };
    }

    await completeLlmJob(id, result, env);
    return { ok: true, result };
  } catch (err) {
    const message = String(err?.message || err).slice(0, 512);
    const max = claimed.maxAttempts || 3;
    const dead = (claimed.attempt || 0) >= max;
    await failLlmJob(id, message, env, { deadLetter: dead });
    if (dead) await publishLlmJobDlq(claimed, message, env);
    return { ok: false, error: message };
  }
}

module.exports = {
  processLlmJob,
};
