/**
 * Persist the work unit, then publish a routing message.
 * Does not call the LLM and does not build the WBS tree.
 */

const {
  WBS_CHUNK_SCHEMA_VERSION,
  resolveWbsChunkMaxAttempts,
} = require('./wbsChunkContract');
const { createWorkUnit, markQueued, getWorkUnit } = require('./wbsWorkUnitStore');
const { publishWbsChunk } = require('./wbsChunkPublisher');

function chunkIdempotencyKey({ runId, inputSnapshotId, chunkIndex }) {
  return `wbs-chunk:${runId}:${inputSnapshotId}:${chunkIndex}:${WBS_CHUNK_SCHEMA_VERSION}`;
}

/**
 * @param {object} spec
 * @param {NodeJS.ProcessEnv} [env]
 */
async function dispatchWbsChunk(spec, env = process.env) {
  const runId = String(spec.runId || '').trim();
  const inputSnapshotId = String(spec.inputSnapshotId || '').trim();
  const chunkIndex = Number(spec.chunkIndex) || 0;
  const idempotencyKey = chunkIdempotencyKey({ runId, inputSnapshotId, chunkIndex });

  const unit = await createWorkUnit(
    {
      runId,
      generationId: spec.generationId || null,
      inputSnapshotId,
      chunkIndex,
      idempotencyKey,
      schemaVersion: WBS_CHUNK_SCHEMA_VERSION,
      maxAttempts: spec.maxAttempts || resolveWbsChunkMaxAttempts(env),
      input: spec.input,
    },
    env
  );

  if (unit.status === 'SUCCEEDED' || unit.status === 'DEAD_LETTER' || unit.status === 'RUNNING') {
    return { unit, published: false, skipped: unit.status };
  }
  if (unit.status === 'QUEUED') {
    return { unit, published: false, skipped: 'QUEUED' };
  }

  try {
    const published = await publishWbsChunk(unit, env);
    const queued = await markQueued(unit.workUnitId, env);
    return { unit: queued || unit, published: true, message: published.message };
  } catch (err) {
    const current = await getWorkUnit(unit.workUnitId, env);
    return {
      unit: current || unit,
      published: false,
      error: String(err?.message || err).slice(0, 240),
    };
  }
}

module.exports = {
  dispatchWbsChunk,
  chunkIdempotencyKey,
};
