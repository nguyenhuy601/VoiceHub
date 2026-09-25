/**
 * Agent Core F2 — WHAT Phase StateGraph (Layer B mirror).
 * G4 + Conflict/Ambiguity (Track A); no Gate interrupt (RULE-F2-03 default).
 */

const {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
} = require('@langchain/langgraph');
const {
  assembleContextPackageAsync,
} = require('../retrieval/contextAssembly');
const { buildCorpusFromSnapshot } = require('../retrieval/buildCorpusFromSnapshot');
const { decideEvaluateAction } = require('./evaluatePolicy');
const {
  resolveAgentBudget,
  evaluateStopCondition,
  STOP_REASONS,
} = require('./agentBudget');
const { buildFeasibilitySignal } = require('../validation/buildFeasibilitySignal');
const { checkFeasibility } = require('../validation/feasibility');

function field() {
  return Annotation();
}

const WhatPhaseState = Annotation.Root({
  runId: field(),
  snapshotId: field(),
  snapshot: field(),
  pack: field(),
  container: field(),
  corpus: field(),
  contextPackage: field(),
  history: field(),
  toolResults: field(),
  g4Understanding: field(),
  conflictAmbiguityGate: field(),
  evaluate: field(),
  feasibilitySignal: field(),
  feasibility: field(),
  goal: field(),
  currentGoal: field(),
  constraints: field(),
  budget: field(),
  stopReason: field(),
  startedAt: field(),
  hitl: field(),
  g4Opts: field(),
});

async function persistNode(state, currentNode, onCheckpoint, extra = {}) {
  if (typeof onCheckpoint !== 'function') return;
  await onCheckpoint({
    runId: state.runId,
    snapshotId: state.snapshotId,
    job: 'phase_what',
    currentNode,
    iteration: Array.isArray(state.history) ? state.history.length : 0,
    history: Array.isArray(state.history) ? [...state.history] : [],
    toolResults: Array.isArray(state.toolResults) ? [...state.toolResults] : [],
    contextPackage: state.contextPackage,
    status: 'running',
    hitl: 'gate1',
    pack: state.pack,
    container: state.container,
    goal: state.goal,
    currentGoal: state.currentGoal,
    constraints: state.constraints,
    budget: state.budget,
    stopReason: state.stopReason,
    feasibilitySignal: state.feasibilitySignal,
    g4Understanding: state.g4Understanding,
    ...extra,
  });
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object }} hooks
 */
function buildWhatPhaseGraph(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const onCheckpoint = hooks.onCheckpoint || null;
  const checkpointer = hooks.checkpointer || new MemorySaver();
  const graph = new StateGraph(WhatPhaseState);

  graph.addNode('understand', async (state) => {
    const budget = state.budget || resolveAgentBudget();
    const preStop = evaluateStopCondition({
      budget,
      startedAt: state.startedAt,
      iteration: 0,
      toolCallCount: 0,
    });
    if (preStop.stop) {
      const history = [...(state.history || []), `stop:${preStop.reason}`];
      return { history, stopReason: preStop.reason };
    }

    onProgress?.({ node: 'understand', phase: 'what' });
    const snapshotPayload = state.snapshot;
    if (!snapshotPayload || typeof snapshotPayload !== 'object') {
      const err = new Error('Snapshot payload required for WHAT phase (Track A)');
      err.code = 'SNAPSHOT_PAYLOAD_REQUIRED';
      throw err;
    }

    const snapshotCorpus = buildCorpusFromSnapshot(snapshotPayload);
    const fallbackPackText = String(
      snapshotPayload?.overview?.requirementName ||
        state.pack?.overview?.requirementName ||
        ''
    );
    try {
      const { ingestSnapshotToQdrant } = require('../retrieval/ingestSnapshotToQdrant');
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if ((mode === 'qdrant' || mode === 'hybrid') && state.snapshotId) {
        await ingestSnapshotToQdrant({
          snapshot: snapshotPayload,
          snapshotId: state.snapshotId,
        });
      }
    } catch (ingestErr) {
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      if (getG7RagMode() === 'qdrant') throw ingestErr;
      console.warn('[g7_ingest] what soft', ingestErr?.message || ingestErr);
    }

    const contextPackage = await assembleContextPackageAsync({
      query: 'what_requirements',
      corpus: snapshotCorpus.length
        ? snapshotCorpus
        : fallbackPackText
          ? [{ id: 'snap_overview', text: fallbackPackText }]
          : [],
      snapshotId: state.snapshotId,
    });
    const history = [...(state.history || []), 'understand'];
    const next = { ...state, corpus: snapshotCorpus, contextPackage, history };
    await persistNode(next, 'understand', onCheckpoint, { corpus: snapshotCorpus });
    return { corpus: snapshotCorpus, contextPackage, history };
  });

  graph.addNode('plan', async (state) => {
    if (state.stopReason) return {};
    onProgress?.({ node: 'plan', phase: 'what' });
    const history = [...(state.history || []), 'plan'];
    await persistNode({ ...state, history }, 'plan', onCheckpoint);
    return { history };
  });

  graph.addNode('executeG4', async (state) => {
    if (state.stopReason) return {};
    onProgress?.({
      node: 'execute',
      phase: 'what',
      tool: 'RequirementAnalysisTool',
    });
    const { runG4Understanding } = require('../engines/g4Understanding');
    const g4Out = await runG4Understanding({
      snapshot: state.snapshot,
      pack: state.pack,
      ...(state.g4Opts || {}),
    });
    const { evaluateConflictAmbiguityGate } = require('../validation/evaluateConflictAmbiguityGate');
    const conflictAmbiguityGate = evaluateConflictAmbiguityGate({
      g4Understanding: g4Out.g4Understanding,
      validation: g4Out.validation,
    });
    const g4Understanding = {
      ...g4Out.g4Understanding,
      conflictAmbiguityGate,
      meta: {
        ...(g4Out.g4Understanding.meta || {}),
        conflictAmbiguityGate,
      },
    };
    const toolResults = [
      ...(state.toolResults || []),
      { toolName: 'RequirementAnalysisTool', facts: g4Understanding.facts || {} },
    ];
    const history = [...(state.history || []), 'execute:g4'];

    const container =
      state.container && typeof state.container === 'object'
        ? { ...state.container }
        : { analyses: {}, phaseRuns: {} };
    container.analyses = {
      ...(container.analyses || {}),
      g4Understanding,
    };

    await persistNode(
      { ...state, container, toolResults, history, g4Understanding, conflictAmbiguityGate },
      'execute:g4',
      onCheckpoint,
      { g4Understanding, conflictAmbiguityGate }
    );
    return {
      container,
      toolResults,
      history,
      g4Understanding,
      conflictAmbiguityGate,
    };
  });

  graph.addNode('observe', async (state) => {
    onProgress?.({ node: 'observe', phase: 'what' });
    return { history: [...(state.history || []), 'observe'] };
  });

  graph.addNode('evaluateLocal', async (state) => {
    onProgress?.({ node: 'evaluateLocal', phase: 'what' });
    const g4 = state.g4Understanding || {};
    const evaluate = {
      kind: 'evaluate_local',
      enoughInfoToContinue: Array.isArray(g4.requirements)
        ? g4.requirements.length > 0
        : false,
      reason: 'g4_understanding',
    };
    const decision = decideEvaluateAction({
      evaluate,
      contextPackage: state.contextPackage,
      toolResults: state.toolResults,
    });
    evaluate.action = decision.action;
    let history = [...(state.history || [])];
    if (decision.action === 'NEED_TOOL') history.push('need_tool:evaluate');
    if (decision.action === 'RETRIEVE') history.push('retrieve:evaluate');
    history.push('evaluateLocal');
    return { evaluate, history };
  });

  graph.addNode('emitFeasibility', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'what' });
    const feasibilitySignal = buildFeasibilitySignal({
      toolResults: state.toolResults,
      container: state.container,
      runId: state.runId,
      snapshotId: state.snapshotId,
    });
    const evaluate = state.evaluate || {};
    const feasibility = checkFeasibility({
      runId: state.runId,
      snapshotId: state.snapshotId,
      coverageOk: evaluate.enoughInfoToContinue,
    });
    const stopReason = state.stopReason || STOP_REASONS.COMPLETE;
    const history = [...(state.history || []), 'feasibilitySignal'];
    const durationMs = Math.max(0, Date.now() - (state.startedAt || Date.now()));

    const container =
      state.container && typeof state.container === 'object'
        ? { ...state.container }
        : { analyses: {}, phaseRuns: {} };
    if (container.jobs != null) delete container.jobs;
    container.phaseRuns = {
      ...(container.phaseRuns || {}),
      phase_what: {
        ...(container.phaseRuns?.phase_what || {}),
        status: state.stopReason ? 'stopped' : 'ready',
        mode: 'g4',
        remoteRunId: state.runId || null,
        snapshotId: state.snapshotId || null,
        generatedAt: new Date().toISOString(),
        durationMs: state.g4Understanding?.meta?.durationMs ?? durationMs,
        error: state.g4Understanding?.meta?.lastError || state.stopReason || null,
        partial: Boolean(state.g4Understanding?.meta?.partial),
        conflictAmbiguityGate: state.conflictAmbiguityGate,
        agentCore: 'langgraph',
        stopReason,
      },
    };

    const next = {
      ...state,
      container,
      feasibilitySignal,
      feasibility,
      stopReason,
      history,
      hitl: 'gate1',
    };
    await persistNode(next, 'feasibility', onCheckpoint, {
      evaluationResult: evaluate,
      feasibilitySignal,
      feasibility,
      g4Understanding: state.g4Understanding,
      status: 'callback_pending',
      stopReason,
    });
    return {
      container,
      feasibilitySignal,
      feasibility,
      stopReason,
      history,
      hitl: 'gate1',
    };
  });

  graph.addEdge(START, 'understand');
  graph.addEdge('understand', 'plan');
  graph.addEdge('plan', 'executeG4');
  graph.addEdge('executeG4', 'observe');
  graph.addEdge('observe', 'evaluateLocal');
  graph.addEdge('evaluateLocal', 'emitFeasibility');
  graph.addEdge('emitFeasibility', END);

  return graph.compile({ checkpointer });
}

module.exports = {
  WhatPhaseState,
  buildWhatPhaseGraph,
};
