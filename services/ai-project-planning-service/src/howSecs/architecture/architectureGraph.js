/**
 * Architecture LangGraph subgraph — Semantic → Fact → Propose → Accept.
 * Phase SoT: toolSubgraphAdapter Pattern B on howPhaseGraph (Send→addNode).
 * runArchitectureSecGraph remains for isolated unit/harness only — not tool catalog.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildArchitectureSemantic } = require('./architectureSemantic');
const { buildArchitectureFacts } = require('./architectureFacts');
const { proposeArchitectureWithLlm } = require('./architecturePropose');
const {
  acceptArchitectureProposal,
  toArchitectureEngineResult,
} = require('./architectureAccept');
const { applyArchitectureToContainer } = require('../../engines/architecture');

function field() {
  return Annotation();
}

const ArchitectureSecState = Annotation.Root({
  pack: field(),
  container: field(),
  toolData: field(),
  snapshot: field(),
  env: field(),
  generateJsonFn: field(),
  semanticOut: field(),
  facts: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildArchitectureSecGraph() {
  const graph = new StateGraph(ArchitectureSecState);

  graph.addNode('semantic', async (state) => {
    const semanticOut = buildArchitectureSemantic({
      pack: state.pack || {},
      container: state.container || {},
      toolData: state.toolData || {},
      snapshot: state.snapshot || null,
      env: state.env || process.env,
    });
    return { semanticOut };
  });

  graph.addNode('fact', async (state) => {
    const semOut = state.semanticOut;
    if (!semOut?.ok) {
      return { facts: { allowLists: semOut?.allowLists || {}, catalogFacts: [] } };
    }
    const facts = buildArchitectureFacts({
      semantic: semOut.semantic,
      allowLists: semOut.allowLists,
    });
    return { facts };
  });

  graph.addNode('propose', async (state) => {
    const semOut = state.semanticOut;
    if (!semOut?.ok) {
      return {
        proposed: {
          ok: false,
          data: null,
          skipped: true,
          meta: { fallbackReason: 'semantic_incomplete', llmCalls: 0 },
        },
      };
    }
    const proposed = await proposeArchitectureWithLlm({
      semantic: semOut.semantic,
      facts: state.facts,
      env: state.env || process.env,
      generateJsonFn: state.generateJsonFn || null,
    });
    return { proposed };
  });

  graph.addNode('accept', async (state) => {
    const semOut = state.semanticOut || {};
    const proposed = state.proposed || {};
    const accepted = acceptArchitectureProposal({
      raw: proposed.ok ? proposed.data : { items: [], openQuestions: [] },
      semantic: semOut.semantic,
      facts: state.facts,
      openQuestionsIn: [
        ...(semOut.openQuestions || []),
        ...(semOut.ok
          ? []
          : [
              {
                code: 'ARCH_SEMANTIC_INCOMPLETE',
                message: `Thiếu semantic: ${(semOut.missingSlots || []).join(', ')}`,
              },
            ]),
        ...(proposed.ok
          ? []
          : [
              {
                code: 'ARCH_LLM_SKIP_OR_FAIL',
                message: proposed.meta?.fallbackReason || 'llm_unavailable',
              },
            ]),
      ],
    });
    const result = toArchitectureEngineResult(accepted, {
      model: proposed.meta?.model || null,
      llmCalls: proposed.meta?.llmCalls || 0,
    });
    if (!semOut.ok) result.meta.source = 'semantic_incomplete';
    else if (!proposed.ok) result.meta.llmFallback = proposed.meta?.fallbackReason;
    const containerPatch = applyArchitectureToContainer(state.container || {}, result);
    return { result, containerPatch };
  });

  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);

  return graph.compile();
}

let _compiled = null;
function getArchitectureSecGraph() {
  if (!_compiled) _compiled = buildArchitectureSecGraph();
  return _compiled;
}

/**
 * Invoke subgraph (LangGraph entry for this sec).
 */
async function runArchitectureSecGraph(input = {}) {
  const graph = getArchitectureSecGraph();
  const out = await graph.invoke({
    pack: input.pack || {},
    container: input.container || {},
    toolData: input.toolData || {},
    snapshot: input.snapshot || null,
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
  });
  return {
    result: out.result,
    containerPatch: out.containerPatch,
    semantic: out.semanticOut?.semantic || null,
    facts: out.facts || null,
  };
}

module.exports = {
  buildArchitectureSecGraph,
  getArchitectureSecGraph,
  runArchitectureSecGraph,
  ArchitectureSecState,
};
