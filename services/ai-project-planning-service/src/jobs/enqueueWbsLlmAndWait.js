/**
 * Wave M — enqueue WBS LLM job and wait for worker result (M1).
 */

const { isHowWbsLlmQueueEnabled } = require('../contracts/howWbsLlmQueueContract');
const {
  createJob,
  waitForJob,
  resetMemoryJobsForTests,
} = require('./wbsLlmJobService');
const { publishWbsLlmJob, subscribeMemory } = require('../messaging/wbsLlmPublisher');
const { processWbsLlmJob } = require('./processWbsLlmJob');
const {
  compactPackForWbsLlm,
  compactCapabilitiesForWbsLlm,
} = require('../engines/compactWbsLlmInput');

/**
 * Compact input for job (HARD-03 / no PII) — FR module/feature/AC only.
 */
function buildJobInput({ pack, capabilities }) {
  return {
    pack: compactPackForWbsLlm(pack || {}),
    capabilities: compactCapabilitiesForWbsLlm(capabilities || []),
    planningHints: null,
  };
}

/**
 * @param {{
 *   pack?: object,
 *   capabilities?: object[],
 *   planningHints?: object|null,
 *   runId?: string|null,
 *   generationId?: string|null,
 *   attempt?: number,
 *   env?: object,
 *   generateJsonFn?: Function,
 * }} opts
 * @returns {Promise<{ ok: boolean, tasks?: object[], wbs?: object, meta: object }>}
 */
async function enqueueWbsLlmAndWait(opts = {}) {
  const env = opts.env || process.env;
  if (!isHowWbsLlmQueueEnabled(env)) {
    return {
      ok: false,
      meta: { source: 'skipped', fallbackReason: 'HOW_WBS_LLM_QUEUE_off', llmCalls: 0 },
    };
  }

  const job = await createJob(
    {
      runId: opts.runId || null,
      generationId: opts.generationId || null,
      attempt: opts.attempt || 0,
      input: buildJobInput({
        pack: opts.pack,
        capabilities: opts.capabilities,
      }),
    },
    env
  );

  // Memory transport: auto-process when published (simulates worker in-unit).
  let unsub = null;
  const transportFlag = String(env.HOW_WBS_LLM_QUEUE_TRANSPORT || '')
    .trim()
    .toLowerCase();
  const useMemoryWorker =
    transportFlag === 'memory' ||
    (String(env.HOW_WBS_LLM_JOB_MEMORY || '0') === '1' && transportFlag !== 'rabbit');
  if (useMemoryWorker) {
    unsub = subscribeMemory((msg) => {
      processWbsLlmJob(msg.jobId, {
        env,
        generateJsonFn: opts.generateJsonFn,
      }).catch((err) => {
        console.warn('[wbs-llm-queue] memory worker', err?.message || err);
      });
    });
  }

  let pub;
  try {
    pub = await publishWbsLlmJob({ jobId: job.id, runId: opts.runId }, env);
  } catch (err) {
    if (unsub) unsub();
    return {
      ok: false,
      meta: {
        source: 'llm_error',
        llmCalls: 0,
        fallbackReason: `wbs_llm_queue_publish_${err?.message || err}`,
        queue: true,
        jobId: job.id,
      },
    };
  }

  const { job: done, timedOut } = await waitForJob(job.id, env);
  if (unsub) unsub();

  if (timedOut) {
    return {
      ok: false,
      meta: {
        source: 'llm_error',
        llmCalls: 0,
        fallbackReason: 'wbs_llm_queue_timeout',
        queue: true,
        jobId: job.id,
        transport: pub?.transport,
      },
    };
  }

  if (!done) {
    return {
      ok: false,
      meta: {
        source: 'llm_error',
        llmCalls: 0,
        fallbackReason: 'wbs_llm_queue_job_missing',
        queue: true,
        jobId: job.id,
      },
    };
  }

  if (done.status === 'succeeded' && done.result?.ok && done.result.tasks && done.result.wbs) {
    return {
      ok: true,
      tasks: done.result.tasks,
      wbs: done.result.wbs,
      meta: {
        ...(done.result.meta || {}),
        source: done.result.meta?.source || 'llm_hierarchy',
        queue: true,
        jobId: job.id,
        transport: pub?.transport,
      },
    };
  }

  const reason =
    done.error ||
    done.result?.meta?.fallbackReason ||
    'wbs_llm_queue_failed';
  return {
    ok: false,
    meta: {
      ...(done.result?.meta || {}),
      source: 'llm_error',
      llmCalls: done.result?.meta?.llmCalls || 0,
      fallbackReason: reason,
      queue: true,
      jobId: job.id,
      transport: pub?.transport,
    },
  };
}

module.exports = {
  enqueueWbsLlmAndWait,
  buildJobInput,
  resetMemoryJobsForTests,
};
