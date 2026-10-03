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
  stopReason: field(),
  startedAt: field(),
  hitl: field(),
  g4Opts: field(),
  understandingPartial: field(),
  corpusContentHash: field(),
  paused: field(),
  gatePreview: field(),
  g4Partial: field(),
  srsProposal: field(),
  engineResultsById: field(),
  semanticStatuses: field(),
  whatTiming: field(),
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
      const history = [...(state.history || []), `stop:${preStop.reason}`];
      return { history, stopReason: preStop.reason, whatTiming };
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

    // Step 2 — Requirement Understanding (normalize…quality). Step 3 ingest owned by G4 (RULE-DL-09).
    const { resolveAiG4Policy } = require('../config/aiG4Policy');
    const { runUnderstandPrefix } = require('../engines/g4/runG4Pipeline');
    const policy = resolveAiG4Policy(process.env);
    const understandingPartial = await runUnderstandPrefix(
      {
        onProgress: async (evt) => {
          if (!onProgress) return;
          await onProgress({
            ...evt,
            phase: 'what',
            node: evt.substep || evt.node,
          });
        },
      },
      policy,
      snapshotPayload
    );

    const history = [...(state.history || []), 'step2:understanding'];
    whatTiming = markStage(whatTiming, 'understand', {
      ms: endUnderstand(),
      frCount: Array.isArray(understandingPartial?.functionalRequirements)
        ? understandingPartial.functionalRequirements.length
        : 0,
      candidateCount: understandingPartial?.selection?.counts?.candidates ?? null,
    });
    const next = {
      ...state,
      understandingPartial,
      history,
      whatTiming,
    };
    await persistNode(next, 'step2:understanding', onCheckpoint, {
      understandingPartial,
    });
    return {
      understandingPartial,
      history,
      whatTiming,
    };
  });

  graph.addNode('plan', async (state) => {
    if (state.stopReason) return {};
    // Node-only: Step 4 business progress starts inside G4 after Step 3 (semantic/conflict).
    await onProgress?.({
      node: 'agent_understand',
      phase: 'what',
    });
    await onProgress?.({
      node: 'plan',
      phase: 'what',
    });
    const history = [...(state.history || []), 'agent_understand', 'plan'];
    await persistNode({ ...state, history }, 'plan', onCheckpoint);
    return { history };
  });

  graph.addNode('executeG4', async (state) => {
    if (state.stopReason) return {};
    const { markStage, startSpan } = require('./whatTiming');
    let whatTiming = state.whatTiming || null;
    const endG4 = startSpan();
    onProgress?.({
      node: 'execute',
      phase: 'what',
      tool: 'RequirementAnalysisTool',
    });
    const { runFrSemanticTask } = require('../semantic/runFrSemanticTask');
    const frSem = await runFrSemanticTask({
      snapshot: state.snapshot,
      pack: state.pack,
      g4Opts: {
        ...(state.g4Opts || {}),
        pauseAtDataGate: false,
        priorPartial: state.understandingPartial || null,
        priorCorpusHash: state.corpusContentHash || null,
        snapshotId: state.snapshotId,
      },
      runId: state.runId,
      onProgress: async (evt) => {
        if (!onProgress) return;
        await onProgress({
          ...evt,
          phase: 'what',
          node: evt.substep || evt.node,
        });
      },
    });
    const g4Out = frSem.g4Out || frSem.meta?.g4Out || {};
    const g4Understanding = frSem.g4Understanding;
    const conflictAmbiguityGate = frSem.conflictAmbiguityGate;
    const requirementIntegrityGate =
      frSem.requirementIntegrityGate || conflictAmbiguityGate;
    const proposalFragment = frSem.proposalFragment || null;
    const contextPackage = g4Out.contextPackage || state.contextPackage || null;
    const corpusContentHash = g4Out.corpusContentHash || state.corpusContentHash || null;
    const toolResults = [
      ...(state.toolResults || []),
      { toolName: 'RequirementAnalysisTool', facts: g4Understanding?.facts || {} },
    ];
    const history = [
      ...(state.history || []),
      'step3:semantic_fetch',
      'execute:g4',
      'semantic_task:fr',
    ];

    const container =
      state.container && typeof state.container === 'object'
        ? { ...state.container }
        : { analyses: {}, phaseRuns: {} };
    container.analyses = { ...(container.analyses || {}) };
    if (container.analyses.g4Understanding) {
      delete container.analyses.g4Understanding;
    }

    const g4Ms = endG4();
    const st = g4Understanding?.meta?.stageTimings || {};
    if (whatTiming) {
      whatTiming = markStage(whatTiming, 'g4_semantic', {
        ms: st.g4_semantic?.ms ?? null,
        calls: st.g4_semantic?.calls ?? 0,
        evalCount: st.g4_semantic?.evalCount ?? 0,
        promptChars: st.g4_semantic?.promptChars ?? 0,
        skipReason: st.g4_semantic?.skipReason || null,
      });
      whatTiming = markStage(whatTiming, 'g4_conflict', {
        ms: st.g4_conflict?.ms ?? null,
        calls: st.g4_conflict?.calls ?? 0,
        evalCount: st.g4_conflict?.evalCount ?? 0,
        promptChars: st.g4_conflict?.promptChars ?? 0,
        skipReason: st.g4_conflict?.skipReason || null,
      });
      whatTiming = markStage(whatTiming, 'g4_synthesis', {
        ms: st.g4_synthesis?.ms ?? null,
        calls: st.g4_synthesis?.calls ?? 0,
        evalCount: st.g4_synthesis?.evalCount ?? 0,
        promptChars: st.g4_synthesis?.promptChars ?? 0,
        skipReason: st.g4_synthesis?.skipReason || null,
      });
      whatTiming = markStage(whatTiming, 'g4_total', {
        ms: g4Understanding?.meta?.durationMs ?? g4Ms,
        llmCalls: g4Understanding?.meta?.llmCalls ?? 0,
        wallMs: g4Ms,
      });
    }

    await persistNode(
      {
        ...state,
        container,
        toolResults,
        history,
        g4Understanding,
        conflictAmbiguityGate,
        requirementIntegrityGate,
        proposalFragment,
        contextPackage,
        corpusContentHash,
        whatTiming,
      },
      'execute:g4',
      onCheckpoint,
      {
        g4Understanding,
        conflictAmbiguityGate,
        requirementIntegrityGate,
        proposalFragment,
        contextPackage,
        corpusContentHash,
      }
    );
    return {
      container,
      toolResults,
      history,
      g4Understanding,
      conflictAmbiguityGate,
      requirementIntegrityGate,
      proposalFragment,
      contextPackage,
      corpusContentHash,
      whatTiming,
    };
  });

  graph.addNode('observe', async (state) => {
    onProgress?.({
      node: 'observe',
      phase: 'what',
      step: 4,
      substep: 'observe',
    });
    return { history: [...(state.history || []), 'observe'] };
  });

  graph.addNode('evaluateLocal', async (state) => {
    onProgress?.({
      node: 'evaluateLocal',
      phase: 'what',
      step: 4,
      substep: 'evaluate_local',
    });
    const g4 = state.g4Understanding || {};
    const proposalFr = state.srsProposal?.generated?.functionalRequirements?.items || [];
    const evaluate = {
      kind: 'evaluate_local',
      enoughInfoToContinue:
        proposalFr.length > 0 ||
        (Array.isArray(g4.requirements) ? g4.requirements.length > 0 : false),
      reason: proposalFr.length ? 'proposal_fr' : 'g4_understanding',
      frCount: proposalFr.length || (Array.isArray(g4.requirements) ? g4.requirements.length : 0),
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
    onProgress?.({
      node: 'feasibility',
      phase: 'what',
      step: 4,
      // Step 4 UI ends at meta_gate; feasibility is internal finalize (no FE substep)
      substep: 'meta_gate',
    });
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
        mode: 'requirement',
        remoteRunId: state.runId || null,
        snapshotId: state.snapshotId || null,
        generatedAt: new Date().toISOString(),
        durationMs: state.g4Understanding?.meta?.durationMs ?? durationMs,
        error: state.g4Understanding?.meta?.lastError || state.stopReason || null,
        partial: Boolean(state.g4Understanding?.meta?.partial),
        conflictAmbiguityGate: state.conflictAmbiguityGate,
        requirementIntegrityGate:
          state.requirementIntegrityGate || state.conflictAmbiguityGate || null,
        agentCore: 'langgraph',
        stopReason,
        computeStatus: 'completed',
        callbackStatus: 'pending',
        stage: 'finalizing',
        llm: state.g4Understanding?.meta?.llm || null,
        candidateCount: state.g4Understanding?.meta?.candidateCount ?? null,
      },
    };
    if (container.analyses?.g4Understanding) {
      delete container.analyses.g4Understanding;
    }

    let proposalFragment = state.proposalFragment || null;
    if (!proposalFragment && state.g4Understanding) {
      const {
        buildFunctionalRequirementProposal,
      } = require('../requirementAnalysis/functionalRequirements/buildFunctionalRequirementProposal');
      const {
        validateFunctionalRequirements,
      } = require('../requirementAnalysis/functionalRequirements/validateFunctionalRequirements');
      const { synthesis: _s, ...sem } = state.g4Understanding;
      const validated = validateFunctionalRequirements({ g4Understanding: sem });
      proposalFragment = buildFunctionalRequirementProposal({
        validated,
        generationId: state.runId || null,
      });
    }

    // srsProposal already produced by engine_* + metaGate nodes
    let srsProposal = state.srsProposal || null;
    if (srsProposal) {
      container.analyses = { ...(container.analyses || {}), srsProposal };
      container.phaseRuns = {
        ...(container.phaseRuns || {}),
        phase_what: {
          ...(container.phaseRuns?.phase_what || {}),
          readyForGate1: Boolean(srsProposal.completeness?.readyForGate1),
          analysisEngineGraph: true,
        },
      };
    }

    const next = {
      ...state,
      container,
      proposalFragment,
      srsProposal,
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
      proposalFragment,
      srsProposal,
      status: 'callback_pending',
      stopReason,
    });
    return {
      container,
      proposalFragment,
      srsProposal,
      feasibilitySignal,
      feasibility,
      stopReason,
      history,
      hitl: 'gate1',
      g4Understanding: state.g4Understanding,
    };
  });

  const {
    attachAnalysisEngineNodes,
    wireAnalysisEngineEdges,
  } = require('./analysisEngineNodes');
  attachAnalysisEngineNodes(graph, { onProgress });

  graph.addEdge(START, 'understand');
  graph.addEdge('understand', 'plan');
  graph.addEdge('plan', 'executeG4');
  graph.addEdge('executeG4', 'observe');
  // Step 2+: observe → derive → engines → evaluateLocal → metaGate → feasibility
  wireAnalysisEngineEdges(graph, {
    entryNode: 'observe',
    evaluateNode: 'evaluateLocal',
    exitNode: 'emitFeasibility',
  });
  graph.addEdge('emitFeasibility', END);

  return graph.compile({ checkpointer });
}

module.exports = {
  WhatPhaseState,
  buildWhatPhaseGraph,
};
