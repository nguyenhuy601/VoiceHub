/**
 * Idempotent WBS wave resume after workers settle.
 * Persist worker results BEFORE calling this. Early callbacks buffer in Redis/Mongo.
 */

const { Command, MemorySaver } = require('@langchain/langgraph');
const { buildWbsChunkGraph } = require('./wbsChunkGraph');
const {
  isolateChunkInvokeConfig,
  invokeChunkGraph,
  resumeAfterFanIn,
  enrichFanInState,
  snapshotHasInterrupt,
} = require('./runWbsChunkOrchestrator');
const { collectWbsResults, isWaveSettled, waveThreadId, shouldUseDurableAwait } = require('./wbsWaveNodes');
const { resolveWbsChunkTransport } = require('./wbsChunkContract');

const EARLY_RESUME_PREFIX = 'wbs:early_resume:';

/** In-process early-callback buffer (Redis optional via opts.redis). */
const earlyBuffer = new Map();

function bufferEarlyResume(threadId, payload = {}) {
  const key = String(threadId || '');
  if (!key) return;
  earlyBuffer.set(key, { ...(payload || {}), at: Date.now() });
}

function consumeEarlyResume(threadId) {
  const key = String(threadId || '');
  if (!earlyBuffer.has(key)) return null;
  const v = earlyBuffer.get(key);
  earlyBuffer.delete(key);
  return v;
}

async function resolveChunkCheckpointer(opts = {}) {
  const {
    getLangGraphCheckpointer,
    unwrapCheckpointer,
  } = require('../orchestration/langGraphCheckpointer');
  const fromOpts = unwrapCheckpointer(opts.checkpointer);
  if (fromOpts) return fromOpts;
  const env = opts.env || process.env;
  if (shouldUseDurableAwait(env)) {
    try {
      const resolved = await getLangGraphCheckpointer({ env });
      const cp = unwrapCheckpointer(resolved);
      if (cp) return cp;
    } catch {
      /* fall through */
    }
    console.warn(
      '[wbs-chunk] rabbit transport without Redis checkpointer — using MemorySaver (not durable across restart)'
    );
  }
  return new MemorySaver();
}

/**
 * @param {{ runId: string, inputSnapshotId: string, env?: object, checkpointer?: object, generateJsonFn?: Function }} opts
 */
async function resumeWbsWave(opts = {}) {
  const env = opts.env || process.env;
  const runId = String(opts.runId || '').trim();
  const inputSnapshotId = String(opts.inputSnapshotId || '').trim();
  if (!runId || !inputSnapshotId) {
    return { ok: false, error: { code: 'RESUME_ARGS', message: 'runId and inputSnapshotId required' } };
  }

  const { progress, units } = await collectWbsResults(runId, env);
  if (!isWaveSettled(progress)) {
    bufferEarlyResume(waveThreadId(runId, inputSnapshotId), { progress });
    return {
      ok: false,
      waiting: true,
      progress,
      error: { code: 'WAVE_NOT_SETTLED', message: 'chunks still in flight', retryable: true },
    };
  }

  const threadId = waveThreadId(runId, inputSnapshotId);
  const checkpointer = await resolveChunkCheckpointer(opts);
  const graph = buildWbsChunkGraph({ checkpointer });
  const config = isolateChunkInvokeConfig({
    configurable: {
      thread_id: threadId,
      env,
      generateJsonFn: opts.generateJsonFn,
    },
  });

  // Anti double-resume: if already has result on thread, reuse.
  try {
    const snap = await graph.getState(config);
    if (snap?.values?.result) {
      return { ok: true, result: snap.values.result, reused: true, progress };
    }
  } catch {
    /* continue */
  }

  consumeEarlyResume(threadId);
  let value = await enrichFanInState(
    graph,
    await resumeAfterFanIn(graph, config, opts.cycle || 1),
    config,
    runId,
    env
  );

  // Continue classify→reconcile if still interrupted somehow
  let guard = 0;
  while (value?.__interrupt__ && guard < 3) {
    guard += 1;
    value = await enrichFanInState(
      graph,
      await resumeAfterFanIn(graph, config, guard + 1),
      config,
      runId,
      env
    );
  }

  if (value?.result) {
    return { ok: true, result: value.result, progress, unitsCount: units.length };
  }
  return {
    ok: false,
    progress,
    error: {
      code: 'RESUME_NO_RESULT',
      message: 'wave settled but chunk graph returned no result',
      retryable: false,
    },
  };
}

/**
 * Worker hook: after persisting chunk result, try wake if wave settled.
 */
async function maybeResumeWbsWaveAfterChunk(opts = {}) {
  const runId = String(opts.runId || '').trim();
  const inputSnapshotId = String(opts.inputSnapshotId || '').trim();
  if (!runId || !inputSnapshotId) return { skipped: true };
  if (resolveWbsChunkTransport(opts.env || process.env) !== 'rabbit') {
    return { skipped: true, reason: 'not_rabbit' };
  }
  const { progress } = await collectWbsResults(runId, opts.env);
  if (!isWaveSettled(progress)) {
    return { skipped: true, reason: 'not_settled', progress };
  }
  return resumeWbsWave(opts);
}

module.exports = {
  resumeWbsWave,
  maybeResumeWbsWaveAfterChunk,
  bufferEarlyResume,
  consumeEarlyResume,
  resolveChunkCheckpointer,
  EARLY_RESUME_PREFIX,
};
