/**
 * Dependency LangGraph subgraph — Semantic → Fact → Propose → Accept.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildDependencySemantic } = require('./dependencySemantic');
const { buildDependencyFacts } = require('./dependencyFacts');
const { proposeDependencyWithLlm } = require('./dependencyPropose');
const {
  acceptDependencyProposal,
  toDependencyEngineResult,
  applyDependencyToContainer,
} = require('./dependencyAccept');

function field() {
  return Annotation();
}

const DependencySecState = Annotation.Root({
  pack: field(),
  container: field(),
  toolData: field(),
  planningHints: field(),
  env: field(),
  generateJsonFn: field(),
  contextPackage: field(),
  snapshot: field(),
  snapshotId: field(),
  semanticOut: field(),
  facts: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildDependencySecGraph() {
  const graph = new StateGraph(DependencySecState);

  graph.addNode('semantic', async (state) => ({
    semanticOut: await buildDependencySemantic({
      pack: state.pack || {},
      container: state.container || {},
      env: state.env || process.env,
      contextPackage: state.contextPackage || null,
      snapshot: state.snapshot || null,
      snapshotId: state.snapshotId || null,
    }),
  }));

  graph.addNode('fact', async (state) => {
    const sem = state.semanticOut;
    if (!sem?.ok) {
      return { facts: { allowLists: sem?.allowLists || { taskIds: [] }, candidates: [], srsEdges: [] } };
    }
    return {
      facts: buildDependencyFacts({
        pack: state.pack || {},
        container: state.container || {},
        allowLists: sem.allowLists,
        planningHints: state.planningHints || null,
      }),
    };
  });

  graph.addNode('propose', async (state) => {
    if (!state.semanticOut?.ok) {
      return {
        proposed: { ok: false, skipped: true, data: null, meta: { fallbackReason: 'semantic_incomplete' } },
      };
    }
    return {
      proposed: await proposeDependencyWithLlm({
        semantic: state.semanticOut.semantic,
        facts: state.facts,
        env: state.env || process.env,
        generateJsonFn: state.generateJsonFn || null,
      }),
    };
  });

  graph.addNode('accept', async (state) => {
    const sem = state.semanticOut || {};
    const proposed = state.proposed || {};
    const accepted = acceptDependencyProposal({
      raw: proposed.ok ? proposed.data : { edges: [] },
      facts: state.facts,
      openQuestionsIn: [
        ...(sem.openQuestions || []),
        ...(sem.ok
          ? []
          : [{ code: 'DEP_SEMANTIC_INCOMPLETE', message: (sem.missingSlots || []).join(', ') }]),
        ...(proposed.ok
          ? []
          : [{ code: 'DEP_LLM_SKIP', message: proposed.meta?.fallbackReason || 'llm_unavailable' }]),
      ],
    });
    const result = toDependencyEngineResult(accepted, {
      model: proposed.meta?.model || null,
      llmCalls: proposed.meta?.llmCalls || 0,
      candidateTool: state.facts?.candidateTool || null,
    });
    if (!sem.ok) result.meta.source = 'semantic_incomplete';
    return {
      result,
      containerPatch: applyDependencyToContainer(state.container || {}, result),
    };
  });

  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let _compiled = null;
async function runDependencySecGraph(input = {}) {
  if (!_compiled) _compiled = buildDependencySecGraph();
  const out = await _compiled.invoke({
    pack: input.pack || {},
    container: input.container || {},
    toolData: input.toolData || {},
    planningHints: input.planningHints || null,
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshot: input.snapshot || null,
    snapshotId: input.snapshotId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = { buildDependencySecGraph, runDependencySecGraph };
