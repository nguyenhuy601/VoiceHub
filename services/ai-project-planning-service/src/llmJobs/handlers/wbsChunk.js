/**
 * wbs.generate.chunk — delegates to processWbsChunk body / executeWbsChunk.
 */

const { JOB_TYPES } = require('../llmJobContract');

async function handleWbsChunk(job, opts = {}) {
  const payload = job.payload || {};
  if (typeof opts.invokeFn === 'function') {
    return opts.invokeFn({
      jobType: job.jobType,
      payload,
      generateJsonFn: opts.generateJsonFn,
    });
  }

  if (payload.workUnitId) {
    const { processWbsChunk } = require('../../wbsChunk/processWbsChunk');
    const out = await processWbsChunk(payload.workUnitId, {
      env: opts.env || process.env,
      generateJsonFn: opts.generateJsonFn,
      messageSnapshotId: job.snapshotId || payload.inputSnapshotId,
    });
    return {
      ok: Boolean(out?.ok),
      annotation: 'llm_proposal',
      workUnitId: payload.workUnitId,
      result: out,
      error: out?.error || null,
    };
  }

  if (payload.chunkInput) {
    const { executeWbsChunk } = require('../../wbsChunk/executeWbsChunk');
    const out = await executeWbsChunk(payload.chunkInput, {
      env: opts.env || process.env,
      generateJsonFn: opts.generateJsonFn,
    });
    return {
      ok: Boolean(out?.ok !== false),
      annotation: 'llm_proposal',
      ...out,
    };
  }

  return {
    ok: true,
    stub: true,
    annotation: 'llm_proposal',
    leaves: [],
  };
}

handleWbsChunk.jobType = JOB_TYPES.WBS_CHUNK;

module.exports = { handleWbsChunk };
