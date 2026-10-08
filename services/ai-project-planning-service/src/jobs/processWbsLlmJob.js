/**
 * Wave M — execute one WBS LLM job (worker or test harness).
 */

const { decomposeWbsWithLlm } = require('../engines/wbsLlmDecompose');
const { claimJob, completeJob, failJob, getJob } = require('./wbsLlmJobService');

/**
 * @param {string} jobId
 * @param {{ env?: object, generateJsonFn?: Function }} [opts]
 */
async function processWbsLlmJob(jobId, opts = {}) {
  const env = opts.env || process.env;
  const id = String(jobId || '').trim();
  if (!id) return { ok: false, error: 'missing_job_id' };

  const existing = await getJob(id, env);
  if (!existing) return { ok: false, error: 'job_not_found' };
  if (existing.status === 'succeeded') {
    return { ok: true, alreadyDone: true, job: existing };
  }
  if (existing.status === 'failed') {
    return { ok: false, alreadyDone: true, job: existing, error: existing.error };
  }

  const claimed = await claimJob(id, env);
  if (!claimed) {
    const again = await getJob(id, env);
    if (again?.status === 'succeeded') {
      return { ok: true, alreadyDone: true, job: again };
    }
    return { ok: false, error: 'claim_failed', job: again };
  }

  const input = claimed.input || {};
  try {
    const llmOut = await decomposeWbsWithLlm({
      pack: input.pack || {},
      capabilities: input.capabilities || [],
      planningHints: input.planningHints || null,
      env,
      generateJsonFn: opts.generateJsonFn,
    });

    if (llmOut.ok && Array.isArray(llmOut.tasks) && llmOut.wbs) {
      const job = await completeJob(
        id,
        {
          ok: true,
          tasks: llmOut.tasks,
          wbs: llmOut.wbs,
          meta: { ...llmOut.meta, queueWorker: true },
        },
        env
      );
      return { ok: true, job };
    }

    const reason = llmOut.meta?.fallbackReason || 'llm_failed';
    const failResult = {
      ok: false,
      meta: { ...llmOut.meta, queueWorker: true, fallbackReason: reason },
    };
    const job = await failJob(id, reason, env, failResult);
    return { ok: false, job, error: reason, llmMeta: llmOut.meta };
  } catch (err) {
    const msg = String(err?.message || err || 'worker_throw').slice(0, 512);
    const job = await failJob(id, msg, env);
    return { ok: false, job, error: msg };
  }
}

module.exports = { processWbsLlmJob };
