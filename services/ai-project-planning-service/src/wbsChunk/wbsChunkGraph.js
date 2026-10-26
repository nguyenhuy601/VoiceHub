/**
 * WBS chunk orchestrator.
 * Fan-out enqueues work units. Fan-in reads durable rows, retries, then reconciles.
 * LLM calls stay in the worker, outside these nodes.
 */

const {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
  Send,
  interrupt,
} = require('@langchain/langgraph');
const { resolveWbsChunkTransport, resolveWbsChunkConcurrency } = require('./wbsChunkContract');
const { planWbsCallSlices } = require('../contracts/howWbsLlmContract');
const { listWorkUnitsByRun, markDeadLetter } = require('./wbsWorkUnitStore');
const { dispatchWbsChunk } = require('./wbsChunkDispatcher');
const { processWbsChunk } = require('./processWbsChunk');
const { publishWbsChunkDeadLetter } = require('./wbsChunkPublisher');
const { reconcileWbsChunks } = require('./wbsChunkReconcile');

function lastWrite() {
  return Annotation();
}

const WbsChunkState = Annotation.Root({
  runId: lastWrite(),
  generationId: lastWrite(),
  inputSnapshotId: lastWrite(),
  stories: lastWrite(),
  epics: lastWrite(),
  semantic: lastWrite(),
  roleAllowList: lastWrite(),
  localeInstruction: lastWrite(),
  frUnits: lastWrite(),
  chunks: lastWrite(),
  receipts: Annotation({
    reducer: (left, right) => (left || []).concat(right || []),
    default: () => [],
  }),
  retrySends: lastWrite(),
  result: lastWrite(),
});

function envOf(config) {
  return config?.configurable?.env || process.env;
}

async function planChunks(state, config) {
  const frUnits = Array.isArray(state.frUnits) ? state.frUnits : [];
  const slices = planWbsCallSlices(frUnits, envOf(config));
  const chunks = [];
  for (const slice of slices) {
    const chunkIndex = chunks.length;
    const idPrefix = `c${chunkIndex}`;
    chunks.push({
      runId: state.runId,
      generationId: state.generationId || null,
      inputSnapshotId: state.inputSnapshotId,
      chunkIndex,
      input: {
        frUnits: slice,
        stories: state.stories || [],
        epics: state.epics || [],
        semantic: state.semantic || null,
        roleAllowList: state.roleAllowList || null,
        localeInstruction: state.localeInstruction || '',
        idPrefix,
      },
    });
  }
  console.info(`[wbs-chunk] plan run=${state.runId || ''} chunks=${chunks.length}`);
  return { chunks, retrySends: [] };
}

function fanOut(state) {
  if (!Array.isArray(state.chunks) || !state.chunks.length) return 'reconcile';
  return state.chunks.map((chunk) => new Send('enqueueChunk', chunk));
}

async function enqueueChunk(state, config) {
  const out = await dispatchWbsChunk(
    {
      runId: state.runId,
      generationId: state.generationId,
      inputSnapshotId: state.inputSnapshotId,
      chunkIndex: state.chunkIndex,
      input: state.input,
    },
    envOf(config)
  );
  return { receipts: [out.unit?.workUnitId].filter(Boolean) };
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

async function awaitWorkers(state, config) {
  const env = envOf(config);
  // Memory: drain in this node. Rabbit: interrupt fan-in — runWbsChunkOrchestrator
  // isolates ALS from howPhaseGraph so this graph is not isNested, then
  // waitUntilChunkWaveSettled + Command({ resume }) continues here.
  if (resolveWbsChunkTransport(env) === 'memory') {
    const units = await listWorkUnitsByRun(state.runId, env);
    const todo = units.filter((unit) => unit.status === 'PENDING' || unit.status === 'QUEUED');
    await mapPool(todo, resolveWbsChunkConcurrency(env), (unit) =>
      processWbsChunk(unit.workUnitId, {
        env,
        generateJsonFn: config.configurable?.generateJsonFn,
        messageSnapshotId: unit.inputSnapshotId,
      })
    );
    return {};
  }
  interrupt({ type: 'wbs_chunk_fan_in' });
  return {};
}

async function classify(state, config) {
  const env = envOf(config);
  const units = await listWorkUnitsByRun(state.runId, env);
  const retrySends = [];
  for (const unit of units) {
    if (unit.status === 'FAILED') {
      console.error(
        `[wbs-chunk] dead-letter run=${state.runId || ''} unit=${unit.workUnitId || ''} reason=${unit.error || ''}`
      );
      await markDeadLetter(unit.workUnitId, env);
      try {
        await publishWbsChunkDeadLetter({ ...unit, status: 'DEAD_LETTER' }, env);
      } catch (err) {
        console.error('[wbs-chunk] dlq_publish', unit.workUnitId, err?.message || err);
      }
      continue;
    }
    if (unit.status === 'RETRY_WAIT' || unit.status === 'PENDING') {
      retrySends.push({
        runId: unit.runId,
        generationId: unit.generationId,
        inputSnapshotId: unit.inputSnapshotId,
        chunkIndex: unit.chunkIndex,
        input: unit.input,
      });
    }
  }
  console.info(
    `[wbs-chunk] classify run=${state.runId || ''} retry=${retrySends.length} units=${units.length}`
  );
  return { retrySends };
}

function routeAfterClassify(state) {
  if (Array.isArray(state.retrySends) && state.retrySends.length) {
    return state.retrySends.map((row) => new Send('enqueueChunk', row));
  }
  return 'reconcile';
}

async function reconcile(state, config) {
  const env = envOf(config);
  const units = await listWorkUnitsByRun(state.runId, env);
  const result = reconcileWbsChunks(units, {
    inputSnapshotId: state.inputSnapshotId,
    frUnits: state.frUnits,
    stories: state.stories,
    epics: state.epics,
  });
  return { result };
}

function buildWbsChunkGraph(hooks = {}) {
  const checkpointer = hooks.checkpointer || new MemorySaver();
  const graph = new StateGraph(WbsChunkState);

  graph.addNode('planChunks', planChunks);
  graph.addNode('enqueueChunk', enqueueChunk);
  graph.addNode('awaitWorkers', awaitWorkers);
  graph.addNode('classify', classify);
  graph.addNode('reconcile', reconcile);

  graph.addEdge(START, 'planChunks');
  graph.addConditionalEdges('planChunks', fanOut, ['enqueueChunk', 'reconcile']);
  graph.addEdge('enqueueChunk', 'awaitWorkers');
  graph.addEdge('awaitWorkers', 'classify');
  graph.addConditionalEdges('classify', routeAfterClassify, ['enqueueChunk', 'reconcile']);
  graph.addEdge('reconcile', END);

  return graph.compile({ checkpointer });
}

module.exports = {
  buildWbsChunkGraph,
  WbsChunkState,
};
