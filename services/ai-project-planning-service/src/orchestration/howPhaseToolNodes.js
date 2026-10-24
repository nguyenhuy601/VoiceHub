/**
 * HOW tool nodes for howPhaseGraph.
 * Tool order and parallelism are edges on that one graph (HOW_TOOL_DEPENDENCIES).
 * Each node only invokes its tool. Section pipelines stay inside the tool.
 */

const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { applyToolResultToContainer } = require('../tools/applyToolResultToContainer');
const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');
const { buildToolContext, buildToolInput } = require('./runToolsSequence');
const { HOW_TOOL_DEPENDENCIES, CANONICAL_ORDER } = require('./howToolDag');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');
const { resolveAgentBudget, evaluateStopCondition } = require('./agentBudget');

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drop keys the tool copied unchanged from the pre-node container.
 * Parallel nodes (Backlog ∥ WBS) each spread the whole container; merging those
 * snapshots would let a stale atomic key overwrite the sibling's write.
 * @param {object} base
 * @param {object|null|undefined} next
 */
function sparseContainerPatch(base, next) {
  if (!isPlainObject(next)) return null;
  const patch = {};
  for (const key of Object.keys(next)) {
    if (key === 'jobs') continue;
    const nextVal = next[key];
    const baseVal = base?.[key];
    if (nextVal === baseVal) continue;
    if (key === 'planning' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      const planning = {};
      for (const child of Object.keys(nextVal)) {
        if (nextVal[child] === baseVal[child]) continue;
        planning[child] = nextVal[child];
      }
      if (Object.keys(planning).length) patch.planning = planning;
      continue;
    }
    patch[key] = nextVal;
  }
  return Object.keys(patch).length ? patch : null;
}

function mergeStopReason(left, right) {
  return left || right || null;
}

function mergeCurrentToolName(left, right) {
  if (!left) return right || null;
  if (!right || left === right) return left;
  const names = new Set(String(`${left}|${right}`).split('|').filter(Boolean));
  return [...names].join('|');
}

function appendList(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

function shouldSkipHowTool(state, toolName) {
  const stop = String(state?.stopReason || '');
  if (stop.startsWith('BUDGET_') || stop === 'TOOL_FAILED') return true;
  const results = Array.isArray(state?.toolResults) ? state.toolResults : [];
  if (results.some((row) => row?.error)) return true;
  if (results.some((row) => row?.toolName === toolName && !row.error)) return true;
  if (state?.selective) {
    const names = Array.isArray(state.selectiveToolNames) ? state.selectiveToolNames : [];
    if (!names.includes(toolName)) return true;
  }
  const index = CANONICAL_ORDER.indexOf(toolName);
  const startIndex = Number(state?.startIndex) || 0;
  if (!state?.selective && index >= 0 && index < startIndex) return true;
  return false;
}

/**
 * @param {string} toolName
 * @param {{ onProgress?: Function, persist?: Function }} hooks
 */
function createHowToolNode(toolName, hooks = {}) {
  const index = CANONICAL_ORDER.indexOf(toolName);
  const onProgress = hooks.onProgress || null;
  const persist = hooks.persist || null;

  return async function howToolNode(state) {
    if (shouldSkipHowTool(state, toolName)) return {};

    const budget = state.budget || resolveAgentBudget();
    const startedAt =
      typeof state.startedAt === 'number' && Number.isFinite(state.startedAt)
        ? state.startedAt
        : Date.now();
    const preStop = evaluateStopCondition({
      budget,
      startedAt,
      iteration: Array.isArray(state.history) ? state.history.length : 0,
      toolCallCount: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
    });
    if (preStop.stop) {
      const historyDelta = [`stop:${preStop.reason}`];
      if (typeof persist === 'function') {
        await persist(
          {
            ...state,
            history: [...(state.history || []), ...historyDelta],
            stopReason: preStop.reason,
          },
          toolName,
          { currentToolName: toolName, currentToolIndex: index }
        );
      }
      return { history: historyDelta, stopReason: preStop.reason };
    }

    registerDefaultTools();
    console.info(`[how_graph] tool=${toolName}`);
    await onProgress?.({
      node: 'call_tool',
      phase: 'how',
      tool: toolName,
      tools: [toolName],
    });

    const layerBase =
      state.container && typeof state.container === 'object' ? state.container : {};
    const stepStarted = Date.now();
    try {
      const toolContext = buildToolContext({
        pack: state.pack || {},
        toolData: state.toolData || {},
        container: layerBase,
        runId: state.runId || null,
        generationId: state.generationId || state.runId || null,
        contextPackage: state.contextPackage || null,
        toolName,
      });
      toolContext.container = layerBase;
      const input = buildToolInput({
        container: layerBase,
        pack: state.pack || {},
        toolData: state.toolData || {},
        snapshotId: state.snapshotId || null,
        contextPackage: state.contextPackage || null,
        toolName,
      });
      const toolOut = await invokeTool(toolName, input, toolContext);
      assertToolOutputHasEvidence(toolName, toolOut);
      const durationMs = Math.max(0, Date.now() - stepStarted);
      const rawPatch =
        toolOut?.result?.container && typeof toolOut.result.container === 'object'
          ? toolOut.result.container
          : null;
      const containerPatch = sparseContainerPatch(layerBase, rawPatch);
      const merged = applyToolResultToContainer(layerBase, {
        result: { container: containerPatch || {} },
      });
      const resultRow = { toolName, durationMs };
      const historyDelta = [`execute:${toolName}`];
      const toolResults = [...(state.toolResults || []), resultRow];
      const history = [...(state.history || []), ...historyDelta];
      if (typeof persist === 'function') {
        await persist(
          { ...state, container: merged, toolResults, history },
          toolName,
          { currentToolIndex: index + 1, currentToolName: toolName }
        );
      }
      const update = {
        toolResults: [resultRow],
        history: historyDelta,
        currentToolIndex: index + 1,
        currentToolName: toolName,
      };
      if (containerPatch) update.container = containerPatch;
      return update;
    } catch (err) {
      const durationMs = Math.max(0, Date.now() - stepStarted);
      const code = err?.code || 'TOOL_FAILED';
      console.error(
        `[how_graph] tool_error tool=${toolName} code=${code} ms=${durationMs} ${err?.message || err}`
      );
      const resultRow = {
        toolName,
        durationMs,
        error: { code, message: String(err?.message || err).slice(0, 240) },
      };
      const historyDelta = [`error:${toolName}`];
      const toolResults = [...(state.toolResults || []), resultRow];
      const history = [...(state.history || []), ...historyDelta];
      if (typeof persist === 'function') {
        await persist(
          { ...state, toolResults, history, stopReason: 'TOOL_FAILED' },
          toolName,
          { currentToolIndex: index + 1, currentToolName: toolName }
        );
      }
      return {
        toolResults: [resultRow],
        history: historyDelta,
        stopReason: 'TOOL_FAILED',
        currentToolIndex: index + 1,
        currentToolName: toolName,
      };
    }
  };
}

/**
 * Edges of the single HOW tool DAG.
 * Multi-parent tools use one barrier edge so the node waits for every dependency.
 * @returns {{ edges: Array<[string|string[], string]>, roots: string[], terminals: string[] }}
 */
function planHowToolEdges() {
  const edges = [];
  const roots = CANONICAL_ORDER.filter(
    (name) => (HOW_TOOL_DEPENDENCIES[name] || []).length === 0
  );
  for (const name of roots) edges.push(['enterTools', name]);

  for (const toolName of CANONICAL_ORDER) {
    const deps = [...(HOW_TOOL_DEPENDENCIES[toolName] || [])];
    if (deps.length === 1) edges.push([deps[0], toolName]);
    else if (deps.length > 1) edges.push([deps, toolName]);
  }

  const successors = new Set();
  for (const deps of Object.values(HOW_TOOL_DEPENDENCIES)) {
    for (const dep of deps) successors.add(dep);
  }
  const terminals = CANONICAL_ORDER.filter((name) => !successors.has(name));
  edges.push([terminals.length === 1 ? terminals[0] : terminals, 'gateTools']);
  return { edges, roots, terminals };
}

/**
 * @param {import('@langchain/langgraph').StateGraph} graph
 * @param {{ onProgress?: Function, persist?: Function }} hooks
 */
function wireHowToolNodes(graph, hooks) {
  graph.addNode('enterTools', async () => ({}));
  for (const toolName of CANONICAL_ORDER) {
    graph.addNode(toolName, createHowToolNode(toolName, hooks));
  }
  graph.addNode('gateTools', async (state) => {
    const err = howToolFailure(state.toolResults);
    if (err) throw err;
    return {};
  });
  for (const [from, to] of planHowToolEdges().edges) {
    graph.addEdge(from, to);
  }
}

/**
 * @param {Array<{ toolName?: string, error?: object }>|null|undefined} toolResults
 * @returns {Error|null}
 */
function howToolFailure(toolResults) {
  const failed = (Array.isArray(toolResults) ? toolResults : []).filter((row) => row?.error);
  if (!failed.length) return null;
  const names = failed.map((row) => row.toolName || 'tool').join(', ');
  const err = new Error(
    failed
      .map((row) => {
        const name = row.toolName || 'tool';
        const message = String(row.error?.message || '').trim();
        return message ? `${name}: ${message}` : name;
      })
      .join('; ')
  );
  err.code =
    failed.length === 1 && failed[0].error?.code === 'WBS_DECOMPOSITION_FAILED'
      ? 'WBS_DECOMPOSITION_FAILED'
      : 'HOW_TOOL_FAILED';
  err.toolNames = names;
  err.failedTools = failed;
  return err;
}

module.exports = {
  sparseContainerPatch,
  appendList,
  deepMergePlanningContainers,
  shouldSkipHowTool,
  createHowToolNode,
  planHowToolEdges,
  wireHowToolNodes,
  howToolFailure,
  mergeStopReason,
  mergeCurrentToolName,
};
