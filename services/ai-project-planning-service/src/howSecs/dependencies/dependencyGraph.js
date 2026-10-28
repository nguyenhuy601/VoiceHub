/**
 * Dependency LangGraph subgraph — Semantic → Fact → Propose(LLM) → Accept.
 * One-shot; no repair loop. generateJsonFn via invoke opts (not checkpoint SoT).
 */

const crypto = require('crypto');
const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const { buildDependencySemantic } = require('./dependencySemantic');
const { buildDependencyFacts } = require('./dependencyFacts');
const { proposeDependencyWithLlm } = require('./dependencyPropose');
const {
  acceptDependencyProposal,
  toDependencyEngineResult,
  applyDependencyToContainer,
} = require('./dependencyAccept');
const { PROMPT_VERSION } = require('./dependencyAnalysisStatus');

function field() {
  return Annotation();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value ?? null)).digest('hex').slice(0, 16);
}

function computeWbsVersion(semantic = {}) {
  const tasks = (semantic.upstream?.taskBrief || []).map((t) => ({
    id: t.id,
    deliverable: t.deliverable || '',
    dependsOn: t.dependsOn || [],
    description: t.description || '',
  }));
  return stableHash(tasks);
}

function computeInputHash({ semantic, facts, wbsVersion }) {
  return stableHash({
    wbsVersion,
    fr: (semantic?.business?.frBrief || []).map((f) => ({
      id: f.id,
      statement: f.statement || '',
    })),
    evidenceIds: facts?.allowLists?.evidenceIds || [],
    promptVersion: PROMPT_VERSION,
  });
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
  runId: field(),
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
      return {
        facts: {
          allowLists: sem?.allowLists || { taskIds: [], frIds: [], evidenceIds: [] },
          evidence: [],
          meta: { inventForbidden: true },
        },
      };
    }
    return {
      facts: buildDependencyFacts({
        semantic: sem.semantic,
        allowLists: sem.allowLists,
      }),
    };
  });

  graph.addNode('propose', async (state) => {
    if (!state.semanticOut?.ok) {
      return {
        proposed: {
          ok: false,
          skipped: true,
          data: null,
          meta: {
            fallbackReason: 'semantic_incomplete',
            analysisStatus: 'SEMANTIC_INCOMPLETE',
            llmCalls: 0,
          },
        },
      };
    }
    const proposed = await proposeDependencyWithLlm({
      semantic: state.semanticOut.semantic,
      facts: state.facts,
      env: state.env || process.env,
      generateJsonFn: state.generateJsonFn || null,
    });
    return { proposed };
  });

  graph.addNode('accept', async (state) => {
    const sem = state.semanticOut || {};
    const proposed = state.proposed || {};
    const proposeMeta = {
      ...(proposed.meta || {}),
      ok: Boolean(proposed.ok),
      source: proposed.meta?.source,
      fallbackReason: proposed.meta?.fallbackReason,
      analysisStatus: proposed.meta?.analysisStatus,
    };

    const openQuestionsIn = [...(sem.openQuestions || [])];
    if (!sem.ok) {
      openQuestionsIn.push({
        code: 'DEP_SEMANTIC_INCOMPLETE',
        message: (sem.missingSlots || []).join(', ') || 'semantic_incomplete',
      });
    }
    if (!proposed.ok && proposed.meta?.analysisStatus === 'SKIPPED') {
      openQuestionsIn.push({
        code: 'DEP_LLM_SKIP',
        message: 'LLM dependency tắt — chưa phân tích phụ thuộc.',
      });
    }
    if (!proposed.ok && proposed.meta?.analysisStatus === 'FAILED') {
      openQuestionsIn.push({
        code: 'DEP_LLM_FAILED',
        message: proposed.meta?.fallbackReason || 'llm_failed',
      });
    }

    const accepted = acceptDependencyProposal({
      raw: proposed.ok ? proposed.data : { edges: [], openQuestions: [] },
      facts: state.facts,
      openQuestionsIn,
      proposeMeta,
    });

    const allowIds = Array.isArray(sem.allowLists?.taskIds)
      ? sem.allowLists.taskIds.map(String)
      : Array.isArray(state.facts?.allowLists?.taskIds)
        ? state.facts.allowLists.taskIds.map(String)
        : [];

    const wbsVersion = computeWbsVersion(sem.semantic || {});
    const inputHash = computeInputHash({
      semantic: sem.semantic,
      facts: state.facts,
      wbsVersion,
    });
    const runId = String(state.runId || state.snapshotId || 'run-dep');
    const attemptId = `${runId}:${inputHash}`;

    const result = toDependencyEngineResult(accepted, {
      model: proposed.meta?.model || null,
      llmCalls: proposed.meta?.llmCalls || 0,
      providerAttempts: proposed.meta?.providerAttempts || proposed.meta?.llmCalls || 0,
      analyzedTaskIds: allowIds,
      inputHash,
      wbsVersion,
      promptVersion: PROMPT_VERSION,
      runId,
      attemptId,
    });

    // Stale guard: if container already has newer wbsVersion, skip patch
    const existing = state.container?.analyses?.dependency || {};
    const existingWbs = existing.wbsVersion || existing.meta?.wbsVersion;
    let containerPatch = applyDependencyToContainer(state.container || {}, result);
    if (existingWbs && existingWbs !== wbsVersion && existing.inputHash && existing.inputHash !== inputHash) {
      // Newer or different WBS already applied — only skip if existing is newer run; prefer current result when semantic matches current invoke
      if (existing.scheduleReady && existing.analysisComplete && existingWbs !== wbsVersion) {
        containerPatch = {};
        result.meta.staleSkipped = true;
      }
    }

    // Idempotent: same inputHash already applied → empty patch
    if (existing.inputHash && existing.inputHash === inputHash && !result.meta.staleSkipped) {
      containerPatch = containerPatch; // deepMerge replace same namespace is idempotent
      result.meta.reapplySameHash = true;
    }

    return {
      result,
      containerPatch,
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
    runId: input.runId || null,
  });
  return { result: out.result, containerPatch: out.containerPatch };
}

module.exports = {
  buildDependencySecGraph,
  runDependencySecGraph,
  computeWbsVersion,
  computeInputHash,
};
