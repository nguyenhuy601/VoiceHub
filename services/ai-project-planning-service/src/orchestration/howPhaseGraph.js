/**
 * Agent Core — HOW Phase ReAct StateGraph.
 * Soft tool deps live in howToolDag (selectTools filters); not hard wave edges.
 * Governance Gate HITL stays on project-service HTTP (RULE-F2-03 / RULE-LG-03).
 */

const {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
  Send,
} = require('@langchain/langgraph');
const { assembleContextPackageAsync } = require('../retrieval/contextAssembly');
const { buildCorpusFromSnapshot } = require('../retrieval/buildCorpusFromSnapshot');
const {
  appendList,
  appendMessages,
  createSelectToolsNode,
  routeAfterSelectTools,
  lastAiMessage,
  stateForToolSend,
} = require('./toolSelectNodes');
const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');
const {
  mergeCurrentToolName,
  mergeStopReason,
} = require('./howPhaseToolNodes');
const { CANONICAL_ORDER } = require('./howToolDag');
const {
  HOW_SEC_TOOL_NAMES,
  getHowSecToolSubgraph,
} = require('./toolSubgraphAdapter');
const {
  PLAIN_TOOLS_NODE,
  listPlainToolNames,
  buildPlainToolsNode,
  toolCallsFromMessage,
} = require('./phasePlainToolNode');
const { buildHowBacklogRetrieveQuery } = require('./howContextQueries');
const { logHowCtx, buildCtxPromptFragment } = require('./howProposalNodes');
const {
  resolveAgentBudget,
  evaluateStopCondition,
  STOP_REASONS,
} = require('./agentBudget');
const {
  buildFeasibilitySignal,
  signalToG13Candidate,
} = require('../validation/buildFeasibilitySignal');
const {
  scoreArtifactCompleteness,
  buildGapReport,
  gapReportToMessage,
  routeAfterCompleteness,
  STOP_INCOMPLETE,
  envMaxEnrich,
} = require('./artifactCompleteness');

const { preferRight } = require('./sharedPhaseChannels');

/** Bare LastValue breaks when parallel Send tool nodes echo the same channel. */
function field() {
  return Annotation({ reducer: preferRight });
}

const HowPhaseState = Annotation.Root({
  runId: field(),
  snapshotId: field(),
  snapshot: field(),
  pack: field(),
  toolData: field(),
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
  messages: Annotation({
    reducer: appendMessages,
    default: () => [],
  }),
  evaluate: field(),
  feasibilitySignal: field(),
  feasibility: field(),
  goal: field(),
  currentGoal: field(),
  constraints: field(),
  budget: field(),
  stopReason: Annotation({
    reducer: mergeStopReason,
  }),
  startedAt: field(),
  hitl: field(),
  skipUnderstand: field(),
  humanResume: field(),
  agentIteration: Annotation({
    reducer: (left, right) => Math.max(Number(left) || 0, Number(right) || 0),
    default: () => 0,
  }),
  currentToolName: Annotation({
    reducer: mergeCurrentToolName,
  }),
  gapReport: field(),
  enrichLoop: Annotation({
    reducer: (left, right) => Math.max(Number(left) || 0, Number(right) || 0),
    default: () => 0,
  }),
  completeness: field(),
  generationId: field(),
  env: field(),
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

function buildHowEmit(state, { ready }) {
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
  const stopReason = ready
    ? state.stopReason || STOP_REASONS.COMPLETE
    : state.stopReason && String(state.stopReason).startsWith('BUDGET_')
      ? state.stopReason
      : STOP_INCOMPLETE;
  const durationMs = Math.max(0, Date.now() - (state.startedAt || Date.now()));
  const container =
    state.container && typeof state.container === 'object'
      ? { ...state.container }
      : { planning: {}, resource: {}, analyses: {}, phaseRuns: {} };
  if (container.jobs != null) delete container.jobs;
  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    phase_how: {
      ...(container.phaseRuns?.phase_how || {}),
      status: ready ? 'ready' : 'stopped',
      remoteRunId: state.runId || null,
      snapshotId: state.snapshotId || null,
      hitl: 'gate2',
      generatedAt: new Date().toISOString(),
      durationMs,
      error: ready ? null : stopReason,
      stopReason,
      feasibilitySignal,
      feasibility,
      agentCore: 'langgraph_react',
      readyForGate2: Boolean(ready),
      partial: !ready,
    },
  };

  return {
    container,
    feasibilitySignal,
    feasibility,
    evaluate: {
      kind: 'evaluate_local',
      enoughInfoToContinue: ready,
      reason: ready ? 'artifact_ready' : 'incomplete_artifact',
      action: 'CONTINUE',
    },
    stopReason,
    history: [ready ? 'emitReady' : 'emitIncomplete'],
    hitl: 'gate2',
  };
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object, decideToolCalls?: Function }} hooks
 */
function buildHowPhaseGraph(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  const onCheckpoint = hooks.onCheckpoint || null;
  const asSubgraph = Boolean(hooks.asSubgraph);
  const checkpointer = asSubgraph ? null : hooks.checkpointer || new MemorySaver();

  const graph = new StateGraph(HowPhaseState);

  graph.addNode('prepareHowContext', async (state) => {
    if (state.skipUnderstand) {
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
      onProgress?.({ node: 'prepareHowContext', phase: 'how', stopped: true });
      await persistNode(
        { ...state, stopReason: preStop.reason },
        'prepareHowContext',
        onCheckpoint
      );
      return { history: [`stop:${preStop.reason}`], stopReason: preStop.reason };
    }

    onProgress?.({ node: 'prepareHowContext', phase: 'how' });
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
    const query = buildHowBacklogRetrieveQuery(state.pack || {});
    let contextPackage = await assembleContextPackageAsync({
      query,
      corpus,
      snapshotId: state.snapshotId,
    });
    if (ingestWarning && contextPackage && typeof contextPackage === 'object') {
      contextPackage = { ...contextPackage, ingestWarning };
    }
    const { itemCount } = buildCtxPromptFragment(contextPackage);
    logHowCtx('prepareHowContext:how_backlog', contextPackage, itemCount);
    await persistNode(
      { ...state, corpus, contextPackage },
      'prepareHowContext',
        onCheckpoint
    );
    return {
      corpus,
      contextPackage,
      history: ['prepareHowContext', 'context:how_backlog'],
    };
  });

  graph.addNode('selectTools',
    createSelectToolsNode({
      phase: 'how',
      onProgress,
      decideToolCalls: hooks.decideToolCalls,
    })
  );

  /** Pattern B sec subgraphs (Send) + Hybrid A plainTools (ToolNode). */
  const howSecNames = new Set(HOW_SEC_TOOL_NAMES);
  const howPlainNames = new Set(listPlainToolNames('how'));
  const howKnownNames = new Set([...CANONICAL_ORDER, ...HOW_SEC_TOOL_NAMES]);

  for (const toolName of HOW_SEC_TOOL_NAMES) {
    const secCompiled = getHowSecToolSubgraph(toolName);
    // Sec subgraphs do not call onProgress internally — emit call_tool so Monitor stays live.
    graph.addNode(toolName, async (state, config) => {
      await onProgress?.({
        node: 'call_tool',
        phase: 'how',
        tool: toolName,
        tools: [toolName],
      });
      return secCompiled.invoke(state, config);
    });
  }

  graph.addNode(PLAIN_TOOLS_NODE, buildPlainToolsNode({ phase: 'how', onProgress }));

  function routeAfterSelectToolsHow(state) {
    if (routeAfterSelectTools(state) === 'assemble') return 'assemble';
    const ai = lastAiMessage(state.messages);
    const calls = toolCallsFromMessage(ai);
    if (!calls.length) return 'assemble';
    const sends = [];
    let plainQueued = false;
    for (const call of calls) {
      const toolName = call.name || call.toolName;
      if (!toolName || !howKnownNames.has(toolName)) continue;
      if (howSecNames.has(toolName)) {
        sends.push(
          new Send(toolName, stateForToolSend(state, { clearMessages: true }))
        );
        continue;
      }
      if (howPlainNames.has(toolName) && !plainQueued) {
        plainQueued = true;
        // Keep messages — ToolNode reads AIMessage.tool_calls
        sends.push(
          new Send(PLAIN_TOOLS_NODE, stateForToolSend(state, { clearMessages: false }))
        );
      }
    }
    return sends.length ? sends : 'assemble';
  }

  graph.addNode('assemble', async (state) => {
    onProgress?.({ node: 'assemble', phase: 'how' });
    const score = scoreArtifactCompleteness(state, 'how');
    return { completeness: score, history: ['assemble'] };
  });

  graph.addNode('scoreCompleteness', async (state) => {
    const score = state.completeness || scoreArtifactCompleteness(state, 'how');
    return { completeness: score, history: ['scoreCompleteness'] };
  });

  graph.addNode('injectGap', async (state) => {
    const score = state.completeness || scoreArtifactCompleteness(state, 'how');
    const gapReport = buildGapReport(score, state);
    const enrichLoop = (Number(state.enrichLoop) || 0) + 1;
    return {
      gapReport,
      enrichLoop,
      messages: [gapReportToMessage(gapReport)],
      history: [`injectGap:${enrichLoop}`],
    };
  });

  graph.addNode('emitReady', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'how', ready: true });
    const payload = buildHowEmit(state, { ready: true });
    await persistNode({ ...state, ...payload }, 'emitReady', onCheckpoint, {
      status: 'callback_pending',
      stopReason: payload.stopReason,
    });
    return payload;
  });

  graph.addNode('emitIncomplete', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'how', ready: false });
    const payload = buildHowEmit(state, { ready: false });
    await persistNode({ ...state, ...payload }, 'emitIncomplete', onCheckpoint, {
      status: 'callback_pending',
      stopReason: payload.stopReason,
    });
    return payload;
  });

  graph.addEdge(START, 'prepareHowContext');
  graph.addEdge('prepareHowContext', 'selectTools');
  graph.addConditionalEdges('selectTools', routeAfterSelectToolsHow);
  for (const toolName of HOW_SEC_TOOL_NAMES) {
    graph.addEdge(toolName, 'selectTools');
  }
  graph.addEdge(PLAIN_TOOLS_NODE, 'selectTools');
  graph.addEdge('assemble', 'scoreCompleteness');
  graph.addConditionalEdges(
    'scoreCompleteness',
    (state) =>
      routeAfterCompleteness(state, {
        maxEnrich: envMaxEnrich(state.env || process.env),
        env: state.env || process.env,
      }),
    {
      injectGap: 'injectGap',
      emitReady: 'emitReady',
      emitIncomplete: 'emitIncomplete',
    }
  );
  graph.addEdge('injectGap', 'selectTools');
  graph.addEdge('emitReady', END);
  graph.addEdge('emitIncomplete', END);

  return asSubgraph || !checkpointer
    ? graph.compile()
    : graph.compile({ checkpointer });
}

module.exports = {
  HowPhaseState,
  buildHowPhaseGraph,
  STOP_REASONS,
  routeAfterSelectTools,
  routeAfterCompleteness,
};
