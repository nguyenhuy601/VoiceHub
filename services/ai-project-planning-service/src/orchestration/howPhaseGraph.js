/**
 * Agent Core F2 — HOW Phase StateGraph (Layer B).
 * Thin nodes wrap Track A/B/C helpers; no biz metrics in LLM nodes (RULE-F2-01).
 * Governance Gate HITL stays on project-service HTTP (RULE-F2-03 / RULE-H1).
 * Optional awaitHuman = in-run edit_draft only (RULE-H2) — not Gate 2 stamp.
 *
 * Tool order is edges on this graph (see howPhaseToolNodes). A tool may run its own
 * Semantic→Fact→Propose→Accept pipeline; that pipeline is the tool body, not a
 * second phase orchestrator.
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
const {
  appendList,
  deepMergePlanningContainers,
  mergeCurrentToolName,
  mergeStopReason,
  wireHowToolNodes,
} = require('./howPhaseToolNodes');
const { buildHowBacklogRetrieveQuery } = require('./howContextQueries');
const { logHowCtx, buildCtxPromptFragment } = require('./howProposalNodes');
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
  // Parallel tool nodes return sparse patches. The reducer merges them.
  container: Annotation({
    reducer: (left, right) => {
      if (right == null) return left;
      return deepMergePlanningContainers(left, right);
    },
  }),
  corpus: field(),
  contextPackage: field(),
  history: Annotation({
    reducer: appendList,
    default: () => [],
  }),
  toolResults: Annotation({
    reducer: appendList,
    default: () => [],
  }),
  evaluate: field(),
  evaluateAction: field(),
  evaluateLoop: field(),
  feasibilitySignal: field(),
  feasibility: field(),
  goal: field(),
  currentGoal: field(),
  constraints: field(),
  budget: field(),
  stopReason: Annotation({
    reducer: mergeStopReason,
  }),
  selective: field(),
  selectiveToolNames: field(),
  startIndex: field(),
  currentToolIndex: Annotation({
    reducer: (left, right) => Math.max(Number(left) || 0, Number(right) || 0),
    default: () => 0,
  }),
  currentToolName: Annotation({
    reducer: mergeCurrentToolName,
  }),
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
      return { history: [`stop:${preStop.reason}`], stopReason: preStop.reason };
    }

    onProgress?.({ node: 'understand', phase: 'how' });
    const corpusStarted = process.hrtime.bigint();
    const corpus = buildCorpusFromSnapshot(state.snapshot);
    const buildCorpusMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - corpusStarted) / 1e6)
    );
    let ingestWarning = null;
    let ingestOut = null;
    const ingestStarted = process.hrtime.bigint();
    try {
      const { ingestSnapshotToQdrant } = require('../retrieval/ingestSnapshotToQdrant');
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if ((mode === 'qdrant' || mode === 'hybrid') && state.snapshotId) {
        ingestOut = await ingestSnapshotToQdrant({
          snapshot: state.snapshot,
          snapshotId: state.snapshotId,
          corpus,
        });
      }
    } catch (ingestErr) {
      const { getG7RagMode, requiresQdrant } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if (requiresQdrant(mode)) {
        console.error('[g7_ingest] fail-closed', ingestErr?.message || ingestErr);
        throw ingestErr;
      }
      ingestWarning = String(ingestErr?.message || ingestErr);
      console.warn('[g7_ingest] soft', ingestWarning);
    }
    const ingestMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - ingestStarted) / 1e6)
    );
    const query = buildHowBacklogRetrieveQuery(state.pack || {});
    const assembleStarted = process.hrtime.bigint();
    let contextPackage = await assembleContextPackageAsync({
      query,
      corpus,
      snapshotId: state.snapshotId,
    });
    const assembleMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - assembleStarted) / 1e6)
    );
    if (ingestWarning && contextPackage && typeof contextPackage === 'object') {
      contextPackage = { ...contextPackage, ingestWarning };
    }
    const contextStarted = process.hrtime.bigint();
    const { itemCount } = buildCtxPromptFragment(contextPackage);
    const contextBuildMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - contextStarted) / 1e6)
    );
    logHowCtx('understand:how_backlog', contextPackage, itemCount);
    console.info(
      '[g7_understand] %s',
      JSON.stringify({
        event: 'g7_understand',
        snapshotId: state.snapshotId || null,
        buildCorpusMs,
        ingestMs,
        assembleMs,
        contextBuildMs,
        ingestStatus: ingestOut?.status || null,
        corpusDocs: corpus.length,
        contextItems: itemCount,
      })
    );
    const history = [...(state.history || []), 'understand', 'context:how_backlog'];
    const next = { ...state, corpus, contextPackage, history };
    await persistNode(next, 'understand', onCheckpoint);
    return { corpus, contextPackage, history: ['understand', 'context:how_backlog'] };
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
    return { history: ['plan'] };
  });

  graph.addNode('select', async (state) => {
    if (state.selective || state.stopReason) return {};
    onProgress?.({ node: 'select', phase: 'how' });
    const history = [...(state.history || []), 'select'];
    await persistNode({ ...state, history }, 'select', onCheckpoint);
    return { history: ['select'] };
  });

  wireHowToolNodes(graph, {
    onProgress,
    persist: (state, currentNode, extra) =>
      persistNode(state, currentNode, onCheckpoint, extra),
  });

  graph.addNode('observe', async (state) => {
    onProgress?.({ node: 'observe', phase: 'how' });
    return { history: ['observe'] };
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
    return {
      evaluate,
      evaluateAction,
      evaluateLoop: loop + 1,
      history: ['evaluateLocal'],
    };
  });

  graph.addNode('retrieve', async (state) => {
    if (state.selective) {
      return { history: ['retrieve:skipped_selective'] };
    }
    const contextPackage = await assembleContextPackageAsync({
      query: 'how_planning_gap',
      corpus: buildCorpusFromSnapshot(state.snapshot),
      snapshotId: state.snapshotId,
    });
    const history = [...(state.history || []), 'retrieve:evaluate'];
    await persistNode({ ...state, contextPackage, history }, 'retrieve', onCheckpoint);
    return { contextPackage, history: ['retrieve:evaluate'] };
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
      history: ['feasibilitySignal'],
      hitl: 'gate2',
    };
  });

  graph.addNode('awaitHuman', async (state) => {
    const { awaitInRunHitl } = require('./hitlInterrupt');
    const resumed = awaitInRunHitl({
      kind: 'edit_draft',
      runId: state.runId,
      snapshotId: state.snapshotId,
      summary: {
        evaluate: state.evaluate,
        toolCount: Array.isArray(state.toolResults) ? state.toolResults.length : 0,
        phase: 'how',
      },
      prompt: 'In-run review of HOW draft before emit (not Gate 2 Pack stamp)',
    });
    return { history: ['awaitHuman:in_run:edit_draft'], humanResume: resumed };
  });

  function routeAfterStart(state) {
    if (state.selective || state.skipUnderstand) return 'enterTools';
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
      return 'enterTools';
    }
    const { isHitlInterruptEnabled } = require('./hitlInterrupt');
    if (isHitlInterruptEnabled()) return 'awaitHuman';
    return 'emitFeasibility';
  }

  graph.addConditionalEdges(START, routeAfterStart, {
    understand: 'understand',
    enterTools: 'enterTools',
  });
  graph.addEdge('understand', 'plan');
  graph.addEdge('plan', 'select');
  graph.addEdge('select', 'enterTools');
  graph.addEdge('gateTools', 'observe');
  graph.addEdge('observe', 'evaluateLocal');
  graph.addConditionalEdges('evaluateLocal', routeAfterEvaluate, {
    retrieve: 'retrieve',
    enterTools: 'enterTools',
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
