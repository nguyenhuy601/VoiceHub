/**
 * One LangGraph for both phases — Pattern B: addNode(compiled phase subgraph).
 * SharedChannels carry I/O; facade spreads API `input` outside the graph.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildWhatPhaseGraph } = require('./whatPhaseGraph');
const { buildHowPhaseGraph } = require('./howPhaseGraph');
const {
  buildSharedPhaseAnnotations,
  spreadInputToShared,
  projectSharedFromState,
  ORCHESTRATOR_ONLY_KEYS,
} = require('./sharedPhaseChannels');

function field() {
  return Annotation();
}

const PhaseOrchestratorState = Annotation.Root({
  phase: field(),
  threadId: field(),
  output: field(),
  ...buildSharedPhaseAnnotations({ Annotation, field }),
});

function routePhase(state) {
  return state?.phase === 'how' ? 'how' : 'what';
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object, decideToolCalls?: Function }} hooks
 */
function buildPhaseOrchestratorGraph(hooks = {}) {
  const graph = new StateGraph(PhaseOrchestratorState);
  const checkpointer = hooks.checkpointer || null;

  // Pattern B — phase graphs as subgraphs; parent owns checkpointer (RULE-LG-CP-01)
  const childHooks = { ...hooks, asSubgraph: true, checkpointer: null };
  graph.addNode('what', buildWhatPhaseGraph(childHooks));
  graph.addNode('how', buildHowPhaseGraph(childHooks));

  graph.addNode('projectOutput', async (state) => ({
    output: projectSharedFromState(state),
  }));

  graph.addConditionalEdges(START, routePhase, {
    what: 'what',
    how: 'how',
  });
  graph.addEdge('what', 'projectOutput');
  graph.addEdge('how', 'projectOutput');
  graph.addEdge('projectOutput', END);

  return checkpointer ? graph.compile({ checkpointer }) : graph.compile();
}

/**
 * ReAct + Pattern B nested subgraphs burn many steps per tool.
 * WHAT catalog (~9 tools × select+subgraph) + enrich + FR nested graph ≫ default 25.
 * Must be top-level invoke config (not under `configurable`) or LangGraph ignores it.
 */
function resolvePhaseRecursionLimit(opts = {}) {
  const env = opts.env || opts.input?.env || process.env;
  const fromOpts = Number(opts.recursionLimit);
  if (Number.isFinite(fromOpts) && fromOpts >= 1) return Math.floor(fromOpts);
  const fromEnv = Number(env?.AGENT_CORE_RECURSION_LIMIT);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) return Math.floor(fromEnv);
  return 200;
}

/**
 * Facade: accepts legacy `{ phase, input, threadId }` and spreads input → SharedChannels
 * before invoking the orchestrator (no phase.invoke inside graph nodes).
 *
 * @param {{ phase: 'what'|'how', input?: object, threadId?: string, hooks?: object, recursionLimit?: number }} opts
 */
async function runPhaseOrchestrator(opts = {}) {
  const phase = opts.phase === 'how' ? 'how' : 'what';
  const graph = buildPhaseOrchestratorGraph(opts.hooks || {});
  const threadId = String(opts.threadId || `${phase}-run`);
  const shared = spreadInputToShared(opts.input || {});
  const recursionLimit = resolvePhaseRecursionLimit(opts);

  const finalState = await graph.invoke(
    {
      phase,
      threadId,
      output: null,
      ...shared,
    },
    {
      recursionLimit,
      configurable: {
        thread_id: String(shared.runId || threadId || `${phase}-run`),
      },
    }
  );

  if (finalState?.output && typeof finalState.output === 'object') {
    return finalState.output;
  }
  return projectSharedFromState(finalState || {});
}

module.exports = {
  PhaseOrchestratorState,
  routePhase,
  buildPhaseOrchestratorGraph,
  runPhaseOrchestrator,
  resolvePhaseRecursionLimit,
  spreadInputToShared,
  ORCHESTRATOR_ONLY_KEYS,
};
