/**
 * Wave barrier — settle all jobIds (RULE-LLM-12). Memory transport drains workers here.
 */

const {
  listLlmJobsByIds,
  failLlmJob,
  isInFlightStatus,
  isTerminalStatus,
} = require('./llmJobStore');
const {
  resolveLlmJobsTransport,
  resolveLlmJobsPollMs,
  resolveWaveTimeoutMs,
  resolveLlmJobsConcurrency,
} = require('./llmJobContract');
const { processLlmJob } = require('./processLlmJob');
const { drainMemoryMessages, listMemoryMessages } = require('./llmJobPublisher');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapPool(items, concurrency, fn) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, concurrency);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, list.length || 1) }, async () => {
    while (idx < list.length) {
      const cur = idx;
      idx += 1;
      await fn(list[cur]);
    }
  });
  await Promise.all(workers);
}

/**
 * @param {string[]} jobIds
 * @param {{ env?: NodeJS.ProcessEnv, generateJsonFn?: Function, invokeFn?: Function, useEchoStub?: boolean }} [opts]
 * @returns {Promise<{ timedOut: boolean, results: Record<string, object>, errors: Record<string, string>, appliedIds: string[] }>}
 */
async function waitForJobWave(jobIds, opts = {}) {
  const env = opts.env || process.env;
  const ids = [...new Set((Array.isArray(jobIds) ? jobIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const results = {};
  const errors = {};
  if (!ids.length) {
    return { timedOut: false, results, errors, appliedIds: [] };
  }

  const transport = resolveLlmJobsTransport(env);
  const started = Date.now();
  const waitMs = resolveWaveTimeoutMs(env);
  const pollMs = resolveLlmJobsPollMs(env);
  const concurrency = resolveLlmJobsConcurrency(env);

  for (;;) {
    const jobs = await listLlmJobsByIds(ids, env);
    const byId = new Map(jobs.map((j) => [j.jobId, j]));

    for (const id of ids) {
      const job = byId.get(id);
      if (!job) {
        errors[id] = errors[id] || 'job_not_found';
        continue;
      }
      if (job.status === 'succeeded' && job.result != null) {
        results[id] = job.result;
        delete errors[id];
      } else if (job.status === 'publish_failed' || job.status === 'failed' || job.status === 'dead_letter') {
        errors[id] = job.error || job.status;
      }
    }

    const pending = ids.filter((id) => {
      const job = byId.get(id);
      if (!job) return false;
      return isInFlightStatus(job.status);
    });

    if (!pending.length) {
      const appliedIds = ids.filter((id) => results[id] != null);
      const missing = ids.filter((id) => results[id] == null);
      if (missing.length) {
        const err = new Error(`WAVE_INCOMPLETE:${missing.join(',')}`);
        err.code = 'WAVE_INCOMPLETE';
        err.missing = missing;
        err.errors = errors;
        throw err;
      }
      return { timedOut: false, results, errors, appliedIds };
    }

    if (transport === 'memory') {
      const todo = pending
        .map((id) => byId.get(id))
        .filter((j) => j && (j.status === 'queued' || j.status === 'pending'));
      // Also drain any published messages (keeps publisher list in sync)
      drainMemoryMessages();
      if (todo.length) {
        await mapPool(todo, concurrency, (job) =>
          processLlmJob(job.jobId, {
            env,
            generateJsonFn: opts.generateJsonFn,
            invokeFn: opts.invokeFn,
            useEchoStub: opts.useEchoStub,
            allowEchoFallback: opts.allowEchoFallback,
          })
        );
        continue;
      }
    }

    if (Date.now() - started >= waitMs) {
      for (const id of pending) {
        await failLlmJob(id, 'WAVE_TIMEOUT', env, { deadLetter: false });
        errors[id] = 'WAVE_TIMEOUT';
      }
      const err = new Error('WAVE_TIMEOUT');
      err.code = 'WAVE_TIMEOUT';
      err.errors = errors;
      err.timedOut = true;
      throw err;
    }

    await sleep(transport === 'memory' ? 20 : pollMs);
  }
}

module.exports = {
  waitForJobWave,
  mapPool,
};
