/**
 * One WHAT section — LangGraph fact → propose → accept.
 * Propose calls generateJson only. Ids, filters, and seeds stay in fact/accept.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const {
  prepareSectionDerive,
  proposeSectionJson,
  acceptSectionDerive,
} = require('../semantic/runRawSectionDerive');

function field() {
  return Annotation();
}

const SectionState = Annotation.Root({
  opts: field(),
  prepared: field(),
  proposed: field(),
  result: field(),
});

function buildWhatSectionGraph() {
  const graph = new StateGraph(SectionState);

  graph.addNode('fact', async (state) => ({
    prepared: prepareSectionDerive(state.opts || {}),
  }));

  graph.addNode('propose', async (state) => {
    const prepared = state.prepared || {};
    if (prepared.mode !== 'llm') return { proposed: null };
    return {
      proposed: await proposeSectionJson(prepared.bundle, state.opts?.invokeFn),
    };
  });

  graph.addNode('accept', async (state) => {
    const prepared = state.prepared || {};
    if (prepared.mode === 'result') return { result: prepared.result };
    return { result: acceptSectionDerive(prepared.bundle, state.proposed) };
  });

  graph.addEdge(START, 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let compiled = null;

async function runWhatSectionGraph(opts = {}) {
  if (!compiled) compiled = buildWhatSectionGraph();
  const out = await compiled.invoke({ opts });
  return out.result;
}

module.exports = {
  buildWhatSectionGraph,
  runWhatSectionGraph,
};
