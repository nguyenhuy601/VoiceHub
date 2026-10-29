/**
 * Agent Core — WHAT Phase ReAct StateGraph (no tool DAG / catalog / whitelist).
 * Gate 1 HITL stays on project-service HTTP (RULE-F2-03 / RULE-LG-03).
 */

const {
  Annotation,
  StateGraph,
  START,
  END,
  MemorySaver,
  Send,
} = require('@langchain/langgraph');
const {
  resolveAgentBudget,
  evaluateStopCondition,
  STOP_REASONS,
} = require('./agentBudget');
const { buildFeasibilitySignal } = require('../validation/buildFeasibilitySignal');
const { checkFeasibility } = require('../validation/feasibility');
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
  mergeSrsProposalPatches,
  mergeEngineResultsById,
  mergeSemanticStatuses,
  mergeCurrentToolName,
  mergeStopReason,
} = require('./whatPhaseToolNodes');
const { runMetaGateNode } = require('./analysisEngineNodes');
const { WHAT_SECTION_TOOLS, WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
const { CANONICAL_ORDER: WHAT_CANONICAL_ORDER } = require('./whatToolDag');
const { buildWhatSectionToolSubgraph } = require('./toolSubgraphAdapter');
const {
  PLAIN_TOOLS_NODE,
  listPlainToolNames,
  buildPlainToolsNode,
  toolCallsFromMessage,
} = require('./phasePlainToolNode');
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

const WhatPhaseState = Annotation.Root({
  runId: field(),
  snapshotId: field(),
  snapshot: field(),
  pack: field(),
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
  frUnderstanding: field(),
  proposalFragment: field(),
  conflictAmbiguityGate: field(),
  requirementIntegrityGate: field(),
  evaluate: field(),
  feasibilitySignal: field(),
  feasibility: field(),
  goal: field(),
  currentGoal: field(),
  constraints: field(),
  budget: field(),
  stopReason: Annotation({
    reducer: (left, right) => mergeStopReason(left, right),
  }),
  startedAt: field(),
  hitl: field(),
  frOpts: field(),
  env: field(),
  understandingPartial: field(),
  corpusContentHash: field(),
  paused: field(),
  srsProposal: Annotation({
    reducer: mergeSrsProposalPatches,
  }),
  engineResultsById: Annotation({
    reducer: mergeEngineResultsById,
    default: () => ({}),
  }),
  semanticStatuses: Annotation({
    reducer: mergeSemanticStatuses,
    default: () => ({}),
  }),
  whatTiming: field(),
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
  skipUnderstand: field(),
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
    frUnderstanding: state.frUnderstanding,
    srsProposal: state.srsProposal,
    ...extra,
  });
}

function buildEmitPayload(state, { ready }) {
  const feasibilitySignal = buildFeasibilitySignal({
    toolResults: state.toolResults,
    container: state.container,
    runId: state.runId,
    snapshotId: state.snapshotId,
  });
  const evaluate = state.evaluate || {
    kind: 'evaluate_local',
    enoughInfoToContinue: ready,
    reason: ready ? 'artifact_ready' : 'incomplete_artifact',
  };
  const feasibility = checkFeasibility({
    runId: state.runId,
    snapshotId: state.snapshotId,
    coverageOk: ready,
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
      : { analyses: {}, phaseRuns: {} };
  if (container.jobs != null) delete container.jobs;

  let srsProposal = state.srsProposal || null;
  if (srsProposal) {
    container.analyses = { ...(container.analyses || {}), srsProposal };
  }

  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    phase_what: {
      ...(container.phaseRuns?.phase_what || {}),
      status: ready ? 'ready' : 'stopped',
      mode: 'requirement',
      remoteRunId: state.runId || null,
      snapshotId: state.snapshotId || null,
      generatedAt: new Date().toISOString(),
      durationMs: state.frUnderstanding?.meta?.durationMs ?? durationMs,
      error: ready ? null : stopReason,
      partial: !ready,
      conflictAmbiguityGate: state.conflictAmbiguityGate,
      requirementIntegrityGate:
        state.requirementIntegrityGate || state.conflictAmbiguityGate || null,
      agentCore: 'langgraph_react',
      stopReason,
      computeStatus: 'completed',
      callbackStatus: 'pending',
      stage: 'finalizing',
      llm: state.frUnderstanding?.meta?.llm || null,
      candidateCount: state.frUnderstanding?.meta?.candidateCount ?? null,
      readyForGate1: Boolean(srsProposal?.completeness?.readyForGate1),
      analysisEngineGraph: true,
    },
  };
  if (container.analyses?.frUnderstanding) {
    delete container.analyses.frUnderstanding;
  }
  if (container.analyses?.g4Understanding) {
    delete container.analyses.g4Understanding;
  }

  let proposalFragment = state.proposalFragment || null;
  if (!proposalFragment && state.frUnderstanding) {
    const {
      buildFunctionalRequirementProposal,
    } = require('../requirementAnalysis/functionalRequirements/buildFunctionalRequirementProposal');
    const {
      validateFunctionalRequirements,
    } = require('../requirementAnalysis/functionalRequirements/validateFunctionalRequirements');
    const { synthesis: _s, ...sem } = state.frUnderstanding;
    const validated = validateFunctionalRequirements({ frUnderstanding: sem });
    proposalFragment = buildFunctionalRequirementProposal({
      validated,
      generationId: state.runId || null,
    });
  }

  return {
    container,
    proposalFragment,
    srsProposal,
    feasibilitySignal,
    feasibility,
    evaluate,
    stopReason,
    hitl: 'gate1',
    frUnderstanding: state.frUnderstanding,
    history: [ready ? 'emitReady' : 'emitIncomplete'],
  };
}

/**
 * @param {{ onProgress?: Function, onCheckpoint?: Function, checkpointer?: object, decideToolCalls?: Function }} hooks
 */
function buildWhatPhaseGraph(hooks = {}) {
  const onProgress = hooks.onProgress || null;
  // checkpoint projection only when explicitly enabled — LG checkpointer is resume SoT
  const onCheckpoint =
    hooks.asSubgraph || hooks.checkpointer == null
      ? hooks.onCheckpoint || null
      : hooks.onCheckpoint || null;
  const asSubgraph = Boolean(hooks.asSubgraph);
  const checkpointer = asSubgraph ? null : hooks.checkpointer || new MemorySaver();
  const graph = new StateGraph(WhatPhaseState);

  graph.addNode('prepareWhat', async (state) => {
    if (state.skipUnderstand) {
      let corpus = Array.isArray(state.corpus) ? state.corpus : [];
      if (!corpus.length && state.snapshot) {
        corpus = buildCorpusFromSnapshot(state.snapshot);
      }
      return { corpus };
    }

    const {
      createWhatTiming,
      markStage,
      startSpan,
    } = require('./whatTiming');
    let whatTiming =
      state.whatTiming && typeof state.whatTiming === 'object'
        ? state.whatTiming
        : createWhatTiming({
            round: process.env.WHAT_TIMING_ROUND || 0,
            packId: state.pack?._id || state.pack?.id || null,
            snapshotId: state.snapshotId,
            runId: state.runId,
          });

    const budget = state.budget || resolveAgentBudget();
    const preStop = evaluateStopCondition({
      budget,
      startedAt: state.startedAt,
      iteration: 0,
      toolCallCount: 0,
    });
    if (preStop.stop) {
      return {
        history: [`stop:${preStop.reason}`],
        stopReason: preStop.reason,
        whatTiming,
      };
    }

    await onProgress?.({
      step: 1,
      substep: 'prepare',
      node: 'prepare',
      phase: 'what',
    });
    const snapshotPayload = state.snapshot;
    if (!snapshotPayload || typeof snapshotPayload !== 'object') {
      const err = new Error('Snapshot payload required for WHAT phase (Track A)');
      err.code = 'SNAPSHOT_PAYLOAD_REQUIRED';
      throw err;
    }
    const endUnderstand = startSpan();

    // RULE-LG-FR: prefix runs only inside frUnderstanding subgraph — prepare = snapshot/corpus.
    // SoT FR list is often canonicalRaw (Customer Raw), not top-level functionalRequirements[].
    const { listFrs } = require('../tools/requirementAnalysis');
    let snapshot = snapshotPayload;
    let frRows = [];
    try {
      frRows = listFrs(snapshotPayload);
    } catch (err) {
      console.warn('[prepareWhat] listFrs failed:', err?.message || err);
      frRows = Array.isArray(snapshotPayload.functionalRequirements)
        ? snapshotPayload.functionalRequirements
        : [];
    }
    const topLen = Array.isArray(snapshotPayload.functionalRequirements)
      ? snapshotPayload.functionalRequirements.length
      : 0;
    if ((!topLen || topLen === 0) && Array.isArray(frRows) && frRows.length) {
      snapshot = { ...snapshotPayload, functionalRequirements: frRows };
      console.info(
        '[prepareWhat] projected listFrs→functionalRequirements count=%s (was top-level empty)',
        frRows.length
      );
    }
    const corpus = buildCorpusFromSnapshot(snapshot);
    const frCount = Array.isArray(frRows) ? frRows.length : 0;
    whatTiming = markStage(whatTiming, 'prepareWhat', {
      ms: endUnderstand(),
      frCount,
      candidateCount: null,
      topLevelFrCount: topLen,
    });
    const history = ['step2:prepare', 'prepareWhat'];
    await persistNode(
      { ...state, snapshot, history, whatTiming, corpus },
      'prepareWhat',
      onCheckpoint
    );
    return {
      snapshot,
      history,
      whatTiming,
      corpus,
    };
  });

  graph.addNode('selectTools',
    createSelectToolsNode({
      phase: 'what',
      onProgress,
      decideToolCalls: hooks.decideToolCalls,
    })
  );

  const sectionByTool = Object.fromEntries(
    WHAT_SECTION_TOOLS.map((s) => [s.toolName, s.engineId])
  );
  const whatSectionNames = new Set(WHAT_SECTION_TOOLS.map((s) => s.toolName));
  const whatPlainNames = new Set(listPlainToolNames('what'));
  const whatKnownNames = new Set([
    ...WHAT_CANONICAL_ORDER,
    ...WHAT_SECTION_TOOLS.map((s) => s.toolName),
    WHAT_FR_TOOL,
  ]);

  // Pattern B: all WHAT sections including WhatFrTool (engine fr → frSectionHooks).
  // Override hook still accepted for tests: hooks.frSectionNode / hooks.frUnderstandingNode.
  for (const toolName of whatSectionNames) {
    const engineId = sectionByTool[toolName];
    if (!engineId) continue;
    if (toolName === WHAT_FR_TOOL || engineId === 'fr') {
      const frNode =
        typeof hooks.frSectionNode === 'function' || hooks.frSectionNode
          ? hooks.frSectionNode
          : typeof hooks.frUnderstandingNode === 'function' || hooks.frUnderstandingNode
            ? hooks.frUnderstandingNode
            : buildWhatSectionToolSubgraph('fr', {
                onProgress: onProgress
                  ? async (evt) => {
                      await onProgress({
                        ...evt,
                        phase: 'what',
                        node: evt.substep || evt.node || WHAT_FR_TOOL,
                      });
                    }
                  : null,
              });
      graph.addNode(WHAT_FR_TOOL, frNode);
      continue;
    }
    graph.addNode(toolName, buildWhatSectionToolSubgraph(engineId));
  }
  // Ensure WhatFrTool exists even if catalog order omitted (compat).
  if (!whatSectionNames.has(WHAT_FR_TOOL)) {
    const frNode =
      typeof hooks.frSectionNode === 'function' || hooks.frSectionNode
        ? hooks.frSectionNode
        : buildWhatSectionToolSubgraph('fr', {
            onProgress: onProgress
              ? async (evt) => {
                  await onProgress({
                    ...evt,
                    phase: 'what',
                    node: evt.substep || evt.node || WHAT_FR_TOOL,
                  });
                }
              : null,
          });
    graph.addNode(WHAT_FR_TOOL, frNode);
  }

  graph.addNode(PLAIN_TOOLS_NODE, buildPlainToolsNode({ phase: 'what', onProgress }));

  function routeAfterSelectToolsWhat(state) {
    if (routeAfterSelectTools(state) === 'assemble') return 'finalizeMeta';
    const ai = lastAiMessage(state.messages);
    const calls = toolCallsFromMessage(ai);
    if (!calls.length) return 'finalizeMeta';
    const sends = [];
    let plainQueued = false;
    for (const call of calls) {
      const toolName = call.name || call.toolName;
      if (!toolName || !whatKnownNames.has(toolName)) continue;
      if (toolName === WHAT_FR_TOOL || whatSectionNames.has(toolName)) {
        sends.push(
          new Send(
            toolName === WHAT_FR_TOOL ? WHAT_FR_TOOL : toolName,
            stateForToolSend(state, { clearMessages: true })
          )
        );
        continue;
      }
      if (whatPlainNames.has(toolName) && !plainQueued) {
        plainQueued = true;
        sends.push(
          new Send(PLAIN_TOOLS_NODE, stateForToolSend(state, { clearMessages: false }))
        );
      }
    }
    return sends.length ? sends : 'finalizeMeta';
  }

  graph.addNode('finalizeMeta', async (state) => {
    onProgress?.({
      node: 'finalizeMeta',
      phase: 'what',
      step: 4,
      substep: 'meta_gate',
    });
    if (state.stopReason || state.paused) {
      const score = scoreArtifactCompleteness(state, 'what');
      return {
        completeness: score,
        history: ['finalizeMeta:skipped_stop'],
      };
    }
    const out = await runMetaGateNode(state);
    const merged = {
      ...state,
      srsProposal: out.srsProposal,
      engineResultsById: out.engineResultsById,
      container: out.container,
    };
    const score = scoreArtifactCompleteness(merged, 'what');
    return {
      srsProposal: out.srsProposal,
      engineResultsById: out.engineResultsById,
      container: out.container,
      completeness: score,
      history: ['finalizeMeta'],
      whatTiming: out.whatTiming,
    };
  });

  graph.addNode('scoreCompleteness', async (state) => {
    const score =
      state.completeness || scoreArtifactCompleteness(state, 'what');
    onProgress?.({
      node: 'scoreCompleteness',
      phase: 'what',
      ready: score.ready,
    });
    return { completeness: score, history: ['scoreCompleteness'] };
  });

  graph.addNode('injectGap', async (state) => {
    const score = state.completeness || scoreArtifactCompleteness(state, 'what');
    const gapReport = buildGapReport(score, state);
    const msg = gapReportToMessage(gapReport);
    const enrichLoop = (Number(state.enrichLoop) || 0) + 1;
    onProgress?.({ node: 'injectGap', phase: 'what', enrichLoop });
    return {
      gapReport,
      enrichLoop,
      messages: [msg],
      history: [`injectGap:${enrichLoop}`],
    };
  });

  graph.addNode('emitReady', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'what', ready: true });
    const payload = buildEmitPayload(state, { ready: true });
    await persistNode({ ...state, ...payload }, 'emitReady', onCheckpoint, {
      status: 'callback_pending',
      stopReason: payload.stopReason,
    });
    return payload;
  });

  graph.addNode('emitIncomplete', async (state) => {
    onProgress?.({ node: 'feasibility', phase: 'what', ready: false });
    const payload = buildEmitPayload(state, { ready: false });
    await persistNode({ ...state, ...payload }, 'emitIncomplete', onCheckpoint, {
      status: 'callback_pending',
      stopReason: payload.stopReason,
    });
    return payload;
  });

  graph.addEdge(START, 'prepareWhat');
  graph.addEdge('prepareWhat', 'selectTools');
  graph.addConditionalEdges('selectTools', routeAfterSelectToolsWhat);
  if (!whatSectionNames.has(WHAT_FR_TOOL)) {
    graph.addEdge(WHAT_FR_TOOL, 'selectTools');
  }
  for (const toolName of whatSectionNames) {
    graph.addEdge(toolName, 'selectTools');
  }
  graph.addEdge(PLAIN_TOOLS_NODE, 'selectTools');
  graph.addEdge('finalizeMeta', 'scoreCompleteness');
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
  WhatPhaseState,
  buildWhatPhaseGraph,
  /** @deprecated Removed — WhatFrTool node name is WHAT_FR_TOOL / 'WhatFrTool'. */
  FR_UNDERSTANDING_NODE: 'WhatFrTool',
  STOP_REASONS,
  routeAfterSelectTools,
  routeAfterCompleteness,
};
