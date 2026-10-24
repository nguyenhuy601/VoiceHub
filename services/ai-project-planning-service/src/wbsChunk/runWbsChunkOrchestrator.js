/**
 * Supervisor around the WBS chunk graph.
 * The graph checkpoints at fan-in. This loop drains workers, then resumes.
 * It does not call the LLM itself when transport is rabbit.
 */

const { Command, MemorySaver, isGraphInterrupt } = require('@langchain/langgraph');
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

/**
 * @param {object} opts
 * @returns {Promise<{ ok: boolean, tasks?: object[], wbs?: object, meta: object }>}
 */
async function runWbsChunkOrchestrator(opts = {}) {
  const env = opts.env || process.env;
  const frUnits = Array.isArray(opts.frUnits) ? opts.frUnits : [];
  const runId = String(opts.runId || `wbs-${opts.inputSnapshotId || 'local'}`).trim();
  const inputSnapshotId = String(opts.inputSnapshotId || 'snapshot-unbound').trim();
  const graph = buildWbsChunkGraph({ checkpointer: opts.checkpointer || new MemorySaver() });
  const config = {
    configurable: {
      thread_id: `wbs-chunk:${runId}:${inputSnapshotId}`,
      env,
      generateJsonFn: opts.generateJsonFn,
    },
  };
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

  const maxCycles = resolveWbsChunkMaxAttempts(env) + 2;
  let value = await invokeChunkGraph(graph, initial, config);
  let cycles = 0;
  while (shouldDrainWorkers(value) && cycles < maxCycles) {
    cycles += 1;
    await waitUntilChunkWaveSettled(runId, env, opts);
    value = await invokeChunkGraph(graph, new Command({ resume: { cycle: cycles } }), config);
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
    },
  };
}

function shouldDrainWorkers(value) {
  if (!value || value.result) return false;
  if (value.__interrupt__) return true;
  // Nested HOW node: fan-in interrupt is dropped and invoke returns the
  // checkpoint after enqueue, before reconcile wrote a result.
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
 * HOW runs this graph inside another LangGraph node. That marks the chunk
 * graph nested, so fan-in interrupt is thrown instead of returned on the result.
 */
async function invokeChunkGraph(graph, input, config) {
  try {
    return await graph.invoke(input, config);
  } catch (err) {
    const interrupts = readGraphInterrupts(err);
    if (!interrupts) throw err;
    return { __interrupt__: interrupts };
  }
}

module.exports = { runWbsChunkOrchestrator, waitUntilChunkWaveSettled };
