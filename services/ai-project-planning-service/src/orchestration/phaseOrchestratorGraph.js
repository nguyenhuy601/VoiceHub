/**
 * One LangGraph for both phases. The phase field selects the branch.
 * Each branch is the phase graph (WHAT tools or HOW tools). Checkpoint stays
 * on that branch, same thread id the runner already uses.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildWhatPhaseGraph } = require('./whatPhaseGraph');
const { buildHowPhaseGraph } = require('./howPhaseGraph');

function field() {
  return Annotation();
}

const PhaseOrchestratorState = Annotation.Root({
  phase: field(),
  input: field(),
  threadId: field(),
  output: field(),
});

function routePhase(state) {
  return state?.phase === 'how' ? 'how' : 'what';
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object }} hooks
 */
function buildPhaseOrchestratorGraph(hooks = {}) {
  const graph = new StateGraph(PhaseOrchestratorState);

  graph.addNode('what', async (state) => {
    const whatGraph = buildWhatPhaseGraph(hooks);
    const output = await whatGraph.invoke(state.input || {}, {
      configurable: { thread_id: String(state.threadId || 'what') },
    });
    return { output };
  });

  graph.addNode('how', async (state) => {
    const howGraph = buildHowPhaseGraph(hooks);
    const output = await howGraph.invoke(state.input || {}, {
      configurable: { thread_id: String(state.threadId || 'how') },
    });
    return { output };
  });

  graph.addConditionalEdges(START, routePhase, {
    what: 'what',
    how: 'how',
  });
  graph.addEdge('what', END);
  graph.addEdge('how', END);

  return graph.compile();
}

/**
 * @param {{ phase: 'what'|'how', input: object, threadId: string, hooks?: object }} opts
 */
async function runPhaseOrchestrator(opts = {}) {
  const phase = opts.phase === 'how' ? 'how' : 'what';
  const graph = buildPhaseOrchestratorGraph(opts.hooks || {});
  const threadId = String(opts.threadId || `${phase}-run`);
  const finalState = await graph.invoke(
    {
      phase,
      input: opts.input || {},
      threadId,
      output: null,
    },
    { configurable: { thread_id: `orchestrator:${threadId}` } }
  );
  return finalState?.output || {};
}

module.exports = {
  PhaseOrchestratorState,
  routePhase,
  buildPhaseOrchestratorGraph,
  runPhaseOrchestrator,
};
