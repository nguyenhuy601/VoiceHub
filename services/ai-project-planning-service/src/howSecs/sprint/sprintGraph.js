/**
 * Sprint sec — timebox stays fixed. LLM proposes goal and PBI ids.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildSprintFacts } = require('./sprintFacts');
const { proposeSprint } = require('./sprintPropose');
const { acceptSprint } = require('./sprintAccept');

function field() {
  return Annotation();
}

function clip(value, max = 80) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text.length <= max ? text : `${text.slice(0, max)}…`;
}

async function buildSprintSemantic({ pack = {}, container = {}, env = process.env, contextPackage = null, snapshot = null, snapshotId = null } = {}) {
  const { normalizeDeriveLocale } = require('../../semantic/buildSemanticDeriveContext');
  const {
    assembleHowToolContext,
    slimLayer,
    contextAllowsWork,
    missingSlotsFor,
  } = require('../../semanticLayer/howToolContext');
  const locale = normalizeDeriveLocale(
    pack?.aiAnalysis?.deriveLocale || pack?.locale || env.PHASE1_DERIVE_LOCALE
  );
  const facts = buildSprintFacts({ container, pack });
  const layer = await assembleHowToolContext({
    purpose: 'SPRINT',
    pack,
    container,
    env,
    contextPackage,
    snapshot,
    snapshotId,
  });
  const missingSlots = [...(facts.missingSlots || []), ...missingSlotsFor('SPRINT', layer)];
  return {
    ok: facts.ok && contextAllowsWork(layer),
    missingSlots,
    openQuestions: facts.openQuestions,
    allowLists: facts.allowLists,
    facts,
    semantic: {
      business: {
        locale,
        projectName: clip(pack.overview?.name || pack.name, 80),
        goals: (pack.businessGoals || []).map((goal) => clip(goal.name || goal.title || goal, 80)),
      },
      system: {
        sprintLengthDays: container?.planning?.schedulePlan?.meta?.sprintLengthDays ?? null,
        cpmPresent: facts.cpmPresent,
        projectDurationHours: facts.projectDurationHours,
      },
      upstream: {
        sprintIds: facts.allowLists.sprintIds,
        pbiIds: facts.allowLists.pbiIds,
      },
      layer: slimLayer(layer),
    },
  };
}

const SprintState = Annotation.Root({
  pack: field(),
  container: field(),
  env: field(),
  generateJsonFn: field(),
  contextPackage: field(),
  snapshot: field(),
  snapshotId: field(),
  semanticOut: field(),
  proposed: field(),
  result: field(),
  containerPatch: field(),
});

function buildSprintSecGraph() {
  const graph = new StateGraph(SprintState);
  graph.addNode('semantic', async (state) => ({
    semanticOut: await buildSprintSemantic({
      pack: state.pack,
      container: state.container,
      env: state.env,
      contextPackage: state.contextPackage,
      snapshot: state.snapshot,
      snapshotId: state.snapshotId,
    }),
  }));
  graph.addNode('fact', async () => ({}));
  graph.addNode('propose', async (state) => {
    const semanticOut = state.semanticOut || {};
    if (!semanticOut.ok) {
      return { proposed: { ok: false, skipped: true, meta: { fallbackReason: 'semantic_incomplete' } } };
    }
    return {
      proposed: await proposeSprint({
        semantic: semanticOut.semantic,
        facts: semanticOut.facts,
        env: state.env,
        generateJsonFn: state.generateJsonFn,
      }),
    };
  });
  graph.addNode('accept', async (state) => {
    const semanticOut = state.semanticOut || {};
    const proposed = state.proposed || {};
    const skippedReason = semanticOut.ok
      ? proposed.ok
        ? null
        : proposed.meta?.fallbackReason || 'llm_failed'
      : 'semantic_incomplete';
    const accepted = acceptSprint({
      raw: proposed.ok ? proposed.data : {},
      container: state.container || {},
      facts: semanticOut.facts || {},
      skippedReason,
    });
    return {
      result: { schedulePlan: accepted.container?.planning?.schedulePlan, meta: accepted.meta },
      containerPatch: accepted.container,
    };
  });
  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', END);
  return graph.compile();
}

let compiled = null;
async function runSprintSecGraph(input = {}) {
  if (!compiled) compiled = buildSprintSecGraph();
  const out = await compiled.invoke({
    pack: input.pack || {},
    container: input.container || {},
    env: input.env || process.env,
    generateJsonFn: input.generateJsonFn || null,
    contextPackage: input.contextPackage || null,
    snapshot: input.snapshot || null,
    snapshotId: input.snapshotId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = {
  runSprintSecGraph,
  buildSprintSemantic,
  acceptSprint,
};
