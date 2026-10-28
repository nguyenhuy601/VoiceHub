/**
 * Supervisor around the WBS chunk graph.
 * RULE-LG-Q-01: workers run outside the phase graph; this loop drains the queue
 * then resumes the chunk graph with Command({ resume }) on the LG checkpointer.
 * Do not merge results into G15/app Redis as phase resume SoT.
 *
 * Rabbit fan-in uses interrupt() + Command(resume). WbsTool runs inside howPhaseGraph,
 * so parent ALS has __pregel_read → child would be isNested and GraphInterrupt would
 * bubble into HOW instead of pausing the chunk thread. Invoke under an isolated ALS
 * config so the chunk graph stays top-level: interrupt → drain workers → resume.
 */

const {
  Command,
  MemorySaver,
  isGraphInterrupt,
  isInterrupted,
  INTERRUPT,
} = require('@langchain/langgraph');
const { AsyncLocalStorageProviderSingleton } = require('@langchain/core/singletons');
const { buildWbsChunkGraph } = require('./wbsChunkGraph');
const {
  resolveWbsChunkTransport,
  resolveWbsChunkConcurrency,
  resolveWbsChunkPollMs,
  resolveWbsChunkWaitMs,
  resolveWbsChunkMaxAttempts,
} = require('./wbsChunkContract');
const { listWorkUnitsByRun, markAttemptFailed } = require('./wbsWorkUnitStore');
const { processWbsChunk } = require('./processWbsChunk');

/** Parent HOW Pregel keys that mark a child invoke as nested (must not leak into chunk graph). */
const PARENT_PREGEL_KEYS = Object.freeze([
  '__pregel_read',
  '__pregel_send',
  '__pregel_call',
  '__pregel_checkpointer',
  '__pregel_scratchpad',
  '__pregel_resuming',
  '__pregel_abort_signals',
  '__pregel_task_id',
  'checkpoint_ns',
  'checkpoint_map',
  'checkpoint_id',
]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Config for the chunk graph thread — keep env/tool hooks, drop parent HOW pregel bindings.
 * @param {object} config
 */
function isolateChunkInvokeConfig(config = {}) {
  const configurable = { ...(config.configurable || {}) };
  for (const key of PARENT_PREGEL_KEYS) {
    delete configurable[key];
  }
  return {
    ...config,
    configurable,
  };
}

async function mapPool(items, limit, fn) {
  const queue = [...items];
  const workers = Math.max(1, Math.min(queue.length || 1, limit));
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (queue.length) {
        const item = queue.shift();
        if (item) await fn(item);
      }
    })
  );
}

function inFlight(units) {
  return (units || []).filter((unit) =>
    ['PENDING', 'QUEUED', 'RUNNING'].includes(unit.status)
  );
}

/**
 * Memory transport runs the worker pool here. Rabbit waits for external workers.
 */
async function waitUntilChunkWaveSettled(runId, env, hooks) {
  const transport = resolveWbsChunkTransport(env);
  const started = Date.now();
  const waitMs = resolveWbsChunkWaitMs(env);
  const pollMs = resolveWbsChunkPollMs(env);
  const concurrency = resolveWbsChunkConcurrency(env);

  for (;;) {
    const units = await listWorkUnitsByRun(runId, env);
    const pending = inFlight(units);
    if (!pending.length) return { timedOut: false };

    if (transport === 'memory') {
      const todo = pending.filter((unit) => unit.status === 'PENDING' || unit.status === 'QUEUED');
      if (todo.length) {
        await mapPool(todo, concurrency, (unit) =>
          processWbsChunk(unit.workUnitId, {
            env,
            generateJsonFn: hooks.generateJsonFn,
            messageSnapshotId: unit.inputSnapshotId,
          })
        );
        continue;
      }
    }

    if (Date.now() - started >= waitMs) {
      const latest = await listWorkUnitsByRun(runId, env);
      for (const unit of inFlight(latest)) {
        await markAttemptFailed(unit.workUnitId, 'wait_timeout', env, false);
      }
      return { timedOut: true };
    }
    await sleep(transport === 'memory' ? 20 : pollMs);
  }
}

function snapshotHasInterrupt(snap) {
  const tasks = Array.isArray(snap?.tasks) ? snap.tasks : [];
  return tasks.some((task) => Array.isArray(task?.interrupts) && task.interrupts.length > 0);
}

/**
 * Merge invoke return + checkpoint + durable work units into a drain signal.
 */
async function enrichFanInState(graph, value, config, runId, env) {
  let merged = value && typeof value === 'object' ? { ...value } : {};
  if (isInterrupted(merged) && !merged.__interrupt__) {
    merged.__interrupt__ = merged[INTERRUPT];
  }

  let snap = null;
  try {
    snap = await graph.getState(config);
  } catch {
    snap = null;
  }
  const values = snap?.values && typeof snap.values === 'object' ? snap.values : {};
  merged = {
    ...values,
    ...merged,
    receipts:
      Array.isArray(merged.receipts) && merged.receipts.length
        ? merged.receipts
        : Array.isArray(values.receipts)
          ? values.receipts
          : [],
  };
  if (snapshotHasInterrupt(snap)) {
    merged.__interrupt__ = merged.__interrupt__ || true;
  }

  try {
    const units = await listWorkUnitsByRun(runId, env);
    if (inFlight(units).length) {
      merged.__interrupt__ = merged.__interrupt__ || { type: 'wbs_chunk_fan_in', via: 'work_units' };
    }
    if ((!Array.isArray(merged.receipts) || !merged.receipts.length) && units.length) {
      merged.receipts = units.map((unit) => unit.workUnitId).filter(Boolean);
    }
  } catch {
    /* store may be unavailable in unit tests without memory flag */
  }

  return merged;
}

/**
 * @param {object} opts
 * @returns {Promise<{ ok: boolean, tasks?: object[], wbs?: object, meta: object }>}
 */
async function runWbsChunkOrchestrator(opts = {}) {
  const env = opts.env || process.env;
  const frUnits = Array.isArray(opts.frUnits) ? opts.frUnits : [];
  const runId = String(opts.runId || `wbs-${opts.inputSnapshotId || 'local'}`).trim();
  const inputSnapshotId = String(opts.inputSnapshotId || 'snapshot-unbound').trim();
  const {
    getLangGraphCheckpointer,
    unwrapCheckpointer,
  } = require('../orchestration/langGraphCheckpointer');
  let checkpointer = unwrapCheckpointer(opts.checkpointer);
  if (!checkpointer && resolveWbsChunkTransport(env) === 'rabbit') {
    try {
      // Must await — getLangGraphCheckpointer returns { checkpointer, kind }, not a saver.
      const resolved = await getLangGraphCheckpointer({ env });
      checkpointer = unwrapCheckpointer(resolved);
    } catch {
      checkpointer = null;
    }
  }
  if (!checkpointer) checkpointer = new MemorySaver();
  const graph = buildWbsChunkGraph({ checkpointer });
  const config = isolateChunkInvokeConfig({
    configurable: {
      thread_id: `wbs-chunk:${runId}:${inputSnapshotId}`,
      env,
      generateJsonFn: opts.generateJsonFn,
    },
  });
  const initial = {
    runId,
    generationId: opts.generationId || runId,
    inputSnapshotId,
    stories: opts.stories || [],
    epics: opts.epics || [],
    semantic: opts.semantic || null,
    roleAllowList: opts.roleAllowList || null,
    localeInstruction: opts.localeInstruction || '',
    frUnits,
    chunks: [],
    receipts: [],
    retrySends: [],
    result: null,
  };

  const transport = resolveWbsChunkTransport(env);
  // Opt-in only: park without long-poll requires a HOW-phase resume that applies
  // wave result back into WbsTool. Default false so WbsTool drains rabbit workers
  // in-process (Dep/Schedule still run in the same HOW pass).
  const durableRabbit = transport === 'rabbit' && opts.durableAwait === true;

  let value = await enrichFanInState(
    graph,
    await invokeChunkGraph(graph, initial, config),
    config,
    runId,
    env
  );

  // Opt-in durable park — worker/resumeWbsWave continues chunk graph (no long-poll).
  if (durableRabbit && shouldDrainWorkers(value)) {
    const threadId = `wbs-chunk:${runId}:${inputSnapshotId}`;
    console.info(
      `[wbs-chunk] durable_await interrupt run=${runId} thread=${threadId} receipts=${
        Array.isArray(value.receipts) ? value.receipts.length : 0
      }`
    );
    return {
      ok: false,
      waitingExternal: true,
      meta: {
        source: 'waiting_external',
        decompositionOutcome: 'waiting',
        fallbackReason: 'wbs_chunk_fan_in',
        reasonCodes: ['wbs_chunk_durable_await'],
        llmCalls: 0,
        chunks: Array.isArray(value.chunks) ? value.chunks.length : 0,
        chunkOrchestrator: 'langgraph',
        waitingExternal: true,
        threadId,
        runId,
        inputSnapshotId,
        jobId: threadId,
      },
    };
  }

  if (transport === 'rabbit' && shouldDrainWorkers(value)) {
    console.info(
      `[wbs-chunk] rabbit_drain_wait run=${runId} receipts=${
        Array.isArray(value.receipts) ? value.receipts.length : 0
      }`
    );
  }

  const maxCycles = resolveWbsChunkMaxAttempts(env) + 2;
  let cycles = 0;
  while (shouldDrainWorkers(value) && cycles < maxCycles) {
    cycles += 1;
    console.info(
      `[wbs-chunk] fan_in_drain run=${runId} cycle=${cycles} transport=${transport} receipts=${
        Array.isArray(value.receipts) ? value.receipts.length : 0
      }`
    );
    await waitUntilChunkWaveSettled(runId, env, opts);
    value = await enrichFanInState(
      graph,
      await resumeAfterFanIn(graph, config, cycles),
      config,
      runId,
      env
    );
  }

  if (value?.result) return value.result;
  return {
    ok: false,
    meta: {
      source: 'llm_failed',
      decompositionOutcome: 'failure',
      fallbackReason: value?.__interrupt__ ? 'wbs_chunk_fan_in_unresolved' : 'wbs_chunk_no_result',
      reasonCodes: ['wbs_chunk_orchestrator'],
      llmCalls: 0,
      chunks: 0,
      chunkOrchestrator: 'langgraph',
      drainCycles: cycles,
    },
  };
}

function shouldDrainWorkers(value) {
  if (!value || value.result) return false;
  if (value.__interrupt__) return true;
  if (isInterrupted(value)) return true;
  // Soft pause: enqueue finished, interrupt not yet visible on return payload.
  return Array.isArray(value.receipts) && value.receipts.length > 0;
}

function readGraphInterrupts(err) {
  if (isGraphInterrupt(err)) return err.interrupts || [];
  const message = String(err?.message || '');
  if (!message.includes('wbs_chunk_fan_in')) return null;
  try {
    const parsed = JSON.parse(message);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Resume after workers settle: prefer Command(resume) when checkpoint has interrupt;
 * otherwise continue the thread (awaitWorkers → classify) via null invoke / updateState.
 */
async function resumeAfterFanIn(graph, config, cycles) {
  let snap = null;
  try {
    snap = await graph.getState(config);
  } catch {
    snap = null;
  }
  if (snapshotHasInterrupt(snap)) {
    return invokeChunkGraph(graph, new Command({ resume: { cycle: cycles } }), config);
  }
  const next = Array.isArray(snap?.next) ? snap.next : [];
  if (next.includes('awaitWorkers') || next.includes('classify') || next.includes('reconcile')) {
    return invokeChunkGraph(graph, null, config);
  }
  // Soft pause after enqueue: advance as if awaitWorkers completed.
  try {
    await graph.updateState(config, {}, 'awaitWorkers');
  } catch (err) {
    console.warn('[wbs-chunk] updateState_awaitWorkers', err?.message || err);
  }
  return invokeChunkGraph(graph, null, config);
}

/**
 * Invoke chunk graph outside parent HOW ALS so rabbit interrupt stays on this thread.
 */
async function invokeChunkGraph(graph, input, config) {
  const isolated = isolateChunkInvokeConfig(config);
  return AsyncLocalStorageProviderSingleton.runWithConfig(isolated, async () => {
    try {
      const value = await graph.invoke(input, isolated);
      if (isInterrupted(value)) {
        return {
          ...value,
          __interrupt__: value[INTERRUPT] || value.__interrupt__ || true,
        };
      }
      return value;
    } catch (err) {
      const interrupts = readGraphInterrupts(err);
      if (!interrupts) throw err;
      let values = {};
      try {
        const snap = await graph.getState(isolated);
        values = snap?.values && typeof snap.values === 'object' ? snap.values : {};
      } catch {
        values = {};
      }
      return { ...values, __interrupt__: interrupts };
    }
  });
}

module.exports = {
  runWbsChunkOrchestrator,
  waitUntilChunkWaveSettled,
  isolateChunkInvokeConfig,
  shouldDrainWorkers,
  enrichFanInState,
  invokeChunkGraph,
  resumeAfterFanIn,
  snapshotHasInterrupt,
};
