/**
 * Shared LangGraph port: prepare -> enqueue (non-blocking) -> waitForJobWave -> applyBatch.
 * RULE-LLM-12: no per-job await inside What/How tool bodies.
 */

const { persistContextPackage } = require('./persistContextPackage');
const { enqueueLlmJob, enqueueLlmJobBatch } = require('../enqueueLlmJob');
const { waitForJobWave } = require('../waitForJobWave');
const { getPromptMeta } = require('../promptRegistry');
const { defaultGeneration, isJobTypeEnabled } = require('../llmJobContract');

/**
 * Append+dedupe pending job ids by wave (RULE-LLM-13).
 * @param {Array<{ jobId: string, waveId?: string }>|null|undefined} left
 * @param {Array<{ jobId: string, waveId?: string }>|null|undefined} right
 */
function mergePendingJobIds(left, right) {
  const out = [];
  const seen = new Set();
  for (const row of [...(left || []), ...(right || [])]) {
    if (!row || !row.jobId) continue;
    const key = `${row.waveId || ''}::${row.jobId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ jobId: String(row.jobId), waveId: row.waveId || null, toolName: row.toolName || null, jobType: row.jobType || null });
  }
  return out;
}

/**
 * @param {object} request
 * @returns {{ contextRef: string, factsRef: string|null, allowedSources: string[], coverage: object|null }}
 */
function prepareContext(request = {}) {
  const {
    phase,
    profile,
    jobType,
    pack,
    container,
    snapshot,
    focusRefs,
    semantic,
    facts,
    system,
    user,
    bundle,
    extra,
  } = request;

  let compiled = null;
  if (profile || jobType) {
    try {
      const { compileContext } = require('../../dataPlane/compileContext');
      compiled = compileContext({
        profile: profile || undefined,
        pack,
        container,
        snapshot,
        focusRefs,
        ...(extra || {}),
      });
    } catch {
      compiled = null;
    }
  }

  const packageData = {
    phase: phase || null,
    jobType: jobType || null,
    pack: pack || null,
    container: container || null,
    snapshot: snapshot || null,
    semantic: semantic || null,
    facts: facts || null,
    system: system || null,
    user: user || null,
    bundle: bundle || null,
    compiled: compiled || null,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };

  const contextRef = persistContextPackage(packageData, { prefix: 'ctx' });
  const factsRef = facts
    ? persistContextPackage({ facts }, { prefix: 'facts' })
    : null;
  const allowedSources = Array.isArray(compiled?.allowedSources)
    ? compiled.allowedSources.map(String)
    : Array.isArray(request.allowedSources)
      ? request.allowedSources.map(String)
      : [];

  return {
    contextRef,
    factsRef,
    allowedSources,
    coverage: compiled?.coverage || null,
    compiled,
  };
}

/**
 * Enqueue from tool body — does not wait for model.
 * @param {object} input
 * @param {NodeJS.ProcessEnv} [env]
 */
async function enqueueLlmJobsFromTool(input, env = process.env) {
  const jobType = String(input.jobType || '').trim();
  if (!isJobTypeEnabled(jobType, env) && input.forceEnqueue !== true) {
    return { skipped: true, reason: 'job_type_disabled', jobIds: [] };
  }

  const meta = getPromptMeta(jobType);
  const prepared =
    input.contextRef != null
      ? {
          contextRef: input.contextRef,
          factsRef: input.factsRef || null,
          allowedSources: input.allowedSources || [],
        }
      : prepareContext({
          phase: input.phase,
          profile: input.profile,
          jobType,
          pack: input.pack,
          container: input.container,
          snapshot: input.snapshot,
          focusRefs: input.focusRefs,
          semantic: input.semantic,
          facts: input.facts,
          system: input.system,
          user: input.user,
          bundle: input.bundle,
          allowedSources: input.allowedSources,
          extra: input.extra,
        });

  if (prepared.coverage?.status === 'insufficient_context' && input.requireContext !== false) {
    const err = new Error('insufficient_context');
    err.code = 'INSUFFICIENT_CONTEXT';
    err.coverage = prepared.coverage;
    throw err;
  }

  const base = {
    jobType,
    phase: input.phase,
    runId: input.runId,
    snapshotId: input.snapshotId,
    stepId: input.stepId,
    waveId: input.waveId,
    toolName: input.toolName,
    inputVersion: input.inputVersion,
    contextRef: prepared.contextRef,
    factsRef: prepared.factsRef,
    allowedSources: prepared.allowedSources,
    promptVersion: input.promptVersion || meta.promptVersion,
    schemaVersion: input.schemaVersion || meta.schemaVersion,
    generation: input.generation || defaultGeneration(env),
    payload: input.payload || null,
    forceEnqueue: input.forceEnqueue,
  };

  const batch = Array.isArray(input.batch) ? input.batch : null;
  if (batch && batch.length) {
    const rows = batch.map((row, i) => ({
      ...base,
      ...row,
      idempotencyKey:
        row.idempotencyKey ||
        `${input.idempotencyKey || `${jobType}:${input.runId || 'run'}`}:${i}`,
      payload: row.payload != null ? row.payload : base.payload,
    }));
    const enqueued = await enqueueLlmJobBatch(rows, env);
    return {
      skipped: false,
      jobIds: enqueued.map((r) => r.jobId),
      statuses: enqueued,
      contextRef: prepared.contextRef,
      factsRef: prepared.factsRef,
      pending: enqueued.map((r) => ({
        jobId: r.jobId,
        waveId: input.waveId || null,
        toolName: input.toolName || null,
        jobType,
      })),
    };
  }

  const idempotencyKey =
    input.idempotencyKey ||
    `${jobType}:${input.runId || 'run'}:${input.toolName || 'tool'}:${input.waveId || 'wave'}`;
  const one = await enqueueLlmJob({ ...base, idempotencyKey }, env);
  return {
    skipped: false,
    jobIds: [one.jobId],
    statuses: [one],
    contextRef: prepared.contextRef,
    factsRef: prepared.factsRef,
    pending: [
      {
        jobId: one.jobId,
        waveId: input.waveId || null,
        toolName: input.toolName || null,
        jobType,
      },
    ],
  };
}

/**
 * @param {object} opts
 * @param {string[]} opts.jobIds
 * @param {Function} [opts.applyOne] — (jobId, result, meta) => patch
 */
async function applyLlmResults(opts = {}) {
  const jobIds = Array.isArray(opts.jobIds) ? opts.jobIds : [];
  const results = opts.results && typeof opts.results === 'object' ? opts.results : {};
  const appliedIds = [];
  const patches = [];

  for (const jobId of jobIds) {
    const result = results[jobId];
    if (result == null) continue;
    appliedIds.push(jobId);
    if (typeof opts.applyOne === 'function') {
      const patch = await opts.applyOne(jobId, result, opts.meta || {});
      if (patch != null) patches.push(patch);
    }
  }

  if (appliedIds.length < jobIds.length) {
    const missing = jobIds.filter((id) => !appliedIds.includes(id));
    const err = new Error(`WAVE_INCOMPLETE:${missing.join(',')}`);
    err.code = 'WAVE_INCOMPLETE';
    err.missing = missing;
    throw err;
  }

  return { appliedIds, patches, results };
}

/**
 * Convenience for tests / awaitWave node: wait then apply.
 */
async function waitAndApplyWave(opts = {}) {
  const wave = await waitForJobWave(opts.jobIds, {
    env: opts.env,
    generateJsonFn: opts.generateJsonFn,
    invokeFn: opts.invokeFn,
    useEchoStub: opts.useEchoStub,
    allowEchoFallback: opts.allowEchoFallback,
  });
  const applied = await applyLlmResults({
    jobIds: opts.jobIds,
    results: wave.results,
    applyOne: opts.applyOne,
    meta: opts.meta,
  });
  return { ...wave, ...applied };
}

module.exports = {
  mergePendingJobIds,
  prepareContext,
  enqueueLlmJobsFromTool,
  waitForJobWave,
  applyLlmResults,
  waitAndApplyWave,
};
