/**
 * Agent Core F2 — HOW Phase StateGraph (Layer B).
 * Thin nodes wrap Track A/B/C helpers; no biz metrics in LLM nodes (RULE-F2-01).
 * Gate HITL stays on project-service (RULE-F2-03 — no interrupt).
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
const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');
const { runHowToolLoop, resolveHowSteps } = require('./runHowToolLoop');
const { decideEvaluateAction } = require('./evaluatePolicy');
const {
  resolveAgentBudget,
  evaluateStopCondition,
  STOP_REASONS,
} = require('./agentBudget');
const {
  buildFeasibilitySignal,
  signalToG13Candidate,
} = require('../validation/buildFeasibilitySignal');

const MAX_EVALUATE_LOOPS = 2;

/** Last-write-wins field helper */
function field() {
  return Annotation();
}

const HowPhaseState = Annotation.Root({
  runId: field(),
  snapshotId: field(),
  snapshot: field(),
  pack: field(),
  toolData: field(),
  container: field(),
  corpus: field(),
  contextPackage: field(),
  history: field(),
  toolResults: field(),
  evaluate: field(),
  evaluateAction: field(),
  evaluateLoop: field(),
  feasibilitySignal: field(),
  feasibility: field(),
  goal: field(),
  currentGoal: field(),
  constraints: field(),
  budget: field(),
  stopReason: field(),
  selective: field(),
  selectiveToolNames: field(),
  startIndex: field(),
  currentToolIndex: field(),
  currentToolName: field(),
  startedAt: field(),
  hitl: field(),
  skipUnderstand: field(),
  humanResume: field(),
});

async function persistNode(state, currentNode, onCheckpoint, extra = {}) {
  if (typeof onCheckpoint !== 'function') return;
  await onCheckpoint({
    runId: state.runId,
    snapshotId: state.snapshotId,
    job: 'phase_how',
    currentNode,
    iteration: Array.isArray(state.history) ? state.history.length : 0,
    history: Array.isArray(state.history) ? [...state.history] : [],
    toolResults: Array.isArray(state.toolResults) ? [...state.toolResults] : [],
    contextPackage: state.contextPackage,
    status: 'running',
    hitl: 'gate2',
    selectiveReplanSteps: state.selective ? state.selectiveToolNames : null,
    toolData: state.toolData,
    pack: state.pack,
    container: state.container,
    corpus: state.corpus,
    goal: state.goal,
    currentGoal: state.currentGoal,
    constraints: state.constraints,
    budget: state.budget,
    stopReason: state.stopReason,
    feasibilitySignal: state.feasibilitySignal,
    ...extra,
  });
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object }} hooks
 */
function buildHowPhaseGraph(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const onCheckpoint = hooks.onCheckpoint || null;
  const checkpointer = hooks.checkpointer || new MemorySaver();

  const graph = new StateGraph(HowPhaseState);

  graph.addNode('understand', async (state) => {
    if (state.skipUnderstand || state.selective) {
      let corpus = Array.isArray(state.corpus) ? state.corpus : [];
      if (!corpus.length) {
        corpus = buildCorpusFromSnapshot(state.snapshot);
      }
      return { corpus };
    }
    const budget = state.budget || resolveAgentBudget();
    const preStop = evaluateStopCondition({
      budget,
      startedAt: state.startedAt,
      iteration: Array.isArray(state.history) ? state.history.length : 0,
      toolCallCount: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
    });
    if (preStop.stop) {
      const history = [...(state.history || []), `stop:${preStop.reason}`];
      onProgress?.({ node: 'understand', phase: 'how', stopped: true });
      await persistNode({ ...state, history, stopReason: preStop.reason }, 'understand', onCheckpoint);
      return { history, stopReason: preStop.reason };
    }

    onProgress?.({ node: 'understand', phase: 'how' });
    const corpus = buildCorpusFromSnapshot(state.snapshot);
    let ingestWarning = null;
    try {
      const { ingestSnapshotToQdrant } = require('../retrieval/ingestSnapshotToQdrant');
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if ((mode === 'qdrant' || mode === 'hybrid') && state.snapshotId) {
        await ingestSnapshotToQdrant({
          snapshot: state.snapshot,
          snapshotId: state.snapshotId,
        });
      }
    } catch (ingestErr) {
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if (mode === 'qdrant') throw ingestErr;
      ingestWarning = String(ingestErr?.message || ingestErr);
      console.warn('[g7_ingest] soft', ingestWarning);
    }
    let contextPackage = await assembleContextPackageAsync({
      query: 'how_planning',
      corpus,
      snapshotId: state.snapshotId,
    });
    if (ingestWarning && contextPackage && typeof contextPackage === 'object') {
      contextPackage = { ...contextPackage, ingestWarning };
    }
    const history = [...(state.history || []), 'understand'];
    const next = { ...state, corpus, contextPackage, history };
    await persistNode(next, 'understand', onCheckpoint);
    return { corpus, contextPackage, history };
  });

  graph.addNode('plan', async (state) => {
    if (state.selective || state.stopReason) return {};
    onProgress?.({
      node: 'plan',
      phase: 'how',
      tools: HOW_PHASE_TOOL_STEPS.map((s) => s.toolName),
    });
    const history = [...(state.history || []), 'plan'];
    await persistNode({ ...state, history }, 'plan', onCheckpoint);
    return { history };
  });

  graph.addNode('select', async (state) => {
    if (state.selective || state.stopReason) return {};
    onProgress?.({ node: 'select', phase: 'how' });
    const history = [...(state.history || []), 'select'];
    await persistNode({ ...state, history }, 'select', onCheckpoint);
    return { history };
  });

  graph.addNode('execute', async (state) => {
    if (state.stopReason && String(state.stopReason).startsWith('BUDGET_')) {
      return {};
    }
    const steps = resolveHowSteps(state.selective ? state.selectiveToolNames : null);
    let startIndex = Number(state.startIndex) || 0;
    if (state.selective) startIndex = 0;
    // NEED_TOOL re-entry: continue from currentToolIndex if set
    if (
      state.evaluateAction === 'NEED_TOOL' &&
      typeof state.currentToolIndex === 'number' &&
      state.currentToolIndex > 0
    ) {
      startIndex = state.currentToolIndex;
    }

    onProgress?.({
      node: 'execute',
      phase: 'how',
      selective: Boolean(state.selective),
      startIndex,
    });

    const budget = state.budget || resolveAgentBudget();
    const historyBase = (state.history || []).filter(
      (x) => !String(x).startsWith('execute:') && !String(x).startsWith('stop:')
    );

    const seq = await runHowToolLoop({
      steps,
      startIndex,
      container: state.container,
      pack: state.pack,
      toolData: state.toolData,
      snapshotId: state.snapshotId,
      budget,
      startedAt: state.startedAt,
      baseIteration: historyBase.length,
      onToolDone: async ({ nextIndex, toolName, container, toolResults, history: h }) => {
        await persistNode(
          {
            ...state,
            container,
            toolResults,
            history: [...historyBase, ...h],
          },
          'execute',
          onCheckpoint,
          { currentToolIndex: nextIndex, currentToolName: toolName }
        );
      },
    });

    const history = [...historyBase, ...seq.history];
    const toolResults = seq.toolResults;
    const stopReason = seq.stopReason || state.stopReason || null;
    await persistNode(
      { ...state, container: seq.container, toolResults, history, stopReason },
      'execute',
      onCheckpoint,
      {
        currentToolIndex: steps.length,
        currentToolName: null,
      }
    );
    return {
      container: seq.container,
      toolResults,
      history,
      stopReason,
      currentToolIndex: steps.length,
      currentToolName: null,
    };
  });

  graph.addNode('observe', async (state) => {
    onProgress?.({ node: 'observe', phase: 'how' });
    const history = [...(state.history || []), 'observe'];
    return { history };
  });

  graph.addNode('evaluateLocal', async (state) => {
    onProgress?.({ node: 'evaluateLocal', phase: 'how' });
    const tasks = Array.isArray(state.container?.planning?.tasks)
      ? state.container.planning.tasks
      : [];
    const toolResults = Array.isArray(state.toolResults) ? state.toolResults : [];
    const evaluate = {
      kind: 'evaluate_local',
      enoughInfoToContinue: tasks.length > 0 || toolResults.length > 0,
      reason: tasks.length > 0 ? 'tasks_present' : 'engines_completed',
    };
    let evaluateAction = 'CONTINUE';
    const loop = Number(state.evaluateLoop) || 0;
    if (state.stopReason && String(state.stopReason).startsWith('BUDGET_')) {
      evaluateAction = 'CONTINUE';
      evaluate.reason = 'budget_stop';
    } else if (loop >= MAX_EVALUATE_LOOPS) {
      evaluateAction = 'CONTINUE';
      evaluate.reason = 'evaluate_loop_cap';
    } else {
      const decision = decideEvaluateAction({
        evaluate,
        contextPackage: state.contextPackage,
        toolResults,
      });
      evaluateAction = decision.action;
      evaluate.action = decision.action;
      evaluate.decisionReason = decision.reason;
      if (decision.action === 'NEED_TOOL') {
        evaluate.deferredToExit = loop + 1 >= MAX_EVALUATE_LOOPS;
      }
    }
    evaluate.action = evaluateAction;
    const history = [...(state.history || []), 'evaluateLocal'];
    return {
      evaluate,
      evaluateAction,
      evaluateLoop: loop + 1,
      history,
    };
  });

  graph.addNode('retrieve', async (state) => {
    if (state.selective) {
      return { history: [...(state.history || []), 'retrieve:skipped_selective'] };
    }
    const contextPackage = await assembleContextPackageAsync({
      query: 'how_planning_gap',
      corpus: buildCorpusFromSnapshot(state.snapshot),
      snapshotId: state.snapshotId,
    });
    const history = [...(state.history || []), 'retrieve:evaluate'];
    await persistNode({ ...state, contextPackage, history }, 'retrieve', onCheckpoint);
    return { contextPackage, history };
  });

  graph.addNode('emitFeasibility', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'how' });
    const feasibilitySignal = buildFeasibilitySignal({
      toolResults: state.toolResults,
      container: state.container,
      runId: state.runId,
      snapshotId: state.snapshotId,
    });
    const feasibility = signalToG13Candidate(feasibilitySignal, {
      runId: state.runId,
      snapshotId: state.snapshotId,
    });
    const stopReason = state.stopReason || STOP_REASONS.COMPLETE;
    const history = [...(state.history || []), 'feasibilitySignal'];

    const durationMs = Math.max(0, Date.now() - (state.startedAt || Date.now()));
    const container = state.container && typeof state.container === 'object'
      ? { ...state.container }
      : { planning: {}, resource: {}, analyses: {}, phaseRuns: {} };
    if (container.jobs != null) delete container.jobs;
    container.phaseRuns = {
      ...(container.phaseRuns || {}),
      phase_how: {
        ...(container.phaseRuns?.phase_how || {}),
        status: 'ready',
        remoteRunId: state.runId || null,
        snapshotId: state.snapshotId || null,
        hitl: 'gate2',
        selective: state.selective || undefined,
        generatedAt: new Date().toISOString(),
        durationMs,
        error: null,
        stopReason,
        feasibilitySignal,
        feasibility,
        agentCore: 'langgraph',
      },
    };

    const next = {
      ...state,
      container,
      feasibilitySignal,
      feasibility,
      stopReason,
      history,
      hitl: 'gate2',
    };
    await persistNode(next, 'feasibility', onCheckpoint, {
      evaluationResult: state.evaluate,
      feasibilitySignal,
      feasibility,
      status: 'callback_pending',
      currentToolIndex: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
      currentToolName: null,
      selectiveReplanSteps: null,
      stopReason,
    });
    return {
      container,
      feasibilitySignal,
      feasibility,
      stopReason,
      history,
      hitl: 'gate2',
    };
  });

  graph.addNode('awaitHuman', async (state) => {
    const { awaitHumanGate } = require('./hitlInterrupt');
    const resumed = awaitHumanGate({
      gate: 'gate2',
      runId: state.runId,
      snapshotId: state.snapshotId,
      summary: {
        evaluate: state.evaluate,
        toolCount: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
      },
    });
    const history = [...(state.history || []), 'awaitHuman:gate2'];
    return { history, humanResume: resumed };
  });

  function routeAfterStart(state) {
    if (state.selective || state.skipUnderstand) return 'execute';
    return 'understand';
  }

  function routeAfterEvaluate(state) {
    if (state.stopReason && String(state.stopReason).startsWith('BUDGET_')) {
      return 'emitFeasibility';
    }
    const action = state.evaluateAction || 'CONTINUE';
    const loop = Number(state.evaluateLoop) || 0;
    if (action === 'RETRIEVE' && loop <= MAX_EVALUATE_LOOPS && !state.selective) {
      return 'retrieve';
    }
    if (action === 'NEED_TOOL' && loop < MAX_EVALUATE_LOOPS) {
      return 'execute';
    }
    const { isHitlInterruptEnabled } = require('./hitlInterrupt');
    if (isHitlInterruptEnabled()) return 'awaitHuman';
    return 'emitFeasibility';
  }

  graph.addConditionalEdges(START, routeAfterStart, {
    understand: 'understand',
    execute: 'execute',
  });
  graph.addEdge('understand', 'plan');
  graph.addEdge('plan', 'select');
  graph.addEdge('select', 'execute');
  graph.addEdge('execute', 'observe');
  graph.addEdge('observe', 'evaluateLocal');
  graph.addConditionalEdges('evaluateLocal', routeAfterEvaluate, {
    retrieve: 'retrieve',
    execute: 'execute',
    awaitHuman: 'awaitHuman',
    emitFeasibility: 'emitFeasibility',
  });
  graph.addEdge('retrieve', 'evaluateLocal');
  graph.addEdge('awaitHuman', 'emitFeasibility');
  graph.addEdge('emitFeasibility', END);

  return graph.compile({ checkpointer });
}

module.exports = {
  HowPhaseState,
  buildHowPhaseGraph,
  MAX_EVALUATE_LOOPS,
  STOP_REASONS,
};
