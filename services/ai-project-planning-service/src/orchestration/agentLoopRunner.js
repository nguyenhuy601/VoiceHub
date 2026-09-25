/**
 * Pure-JS agentic phase runner (no LangGraph).
 * Interface stable for a future LangGraph adapter: runAgentPhase({...}).
 * HOW execute SoT = per-tool loop with seek (RULE-SEEK-01 / RULE-SEL-01).
 */

const { checkFeasibility } = require('../validation/feasibility');
const {
  buildFeasibilitySignal,
  signalToG13Candidate,
} = require('../validation/buildFeasibilitySignal');
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
const { buildInitialAgentFields } = require('../checkpoint/agentStateSchema');
const { isAgentCoreF2Enabled } = require('./agentCoreFlag');

const PHASE_HOW = 'how';
const PHASE_WHAT = 'what';

/** HOW tool names in execute order (phase-only). */
const HOW_PHASE_TOOL_NAMES = Object.freeze(
  HOW_PHASE_TOOL_STEPS.map((s) => s.toolName)
);

/**
 * @param {object} opts
 * @param {'how'|'what'} opts.phase
 * @param {object} [opts.resumeState] — G15 checkpoint state (seek / pin)
 * @param {string[]} [opts.selectiveToolNames] — RULE-SEL-01
 */
async function runAgentPhase({
  phase,
  container,
  pack = {},
  toolData = {},
  snapshot = null,
  snapshotId = null,
  runId = null,
  onProgress = null,
  onCheckpoint = null,
  g4Opts = {},
  resumeState = null,
  selectiveToolNames = null,
  budget = null,
  goal = null,
  constraints = null,
} = {}) {
  const { assertSnapshotBoundary } = require('../knowledge/assertSnapshotBoundary');
  const bound = assertSnapshotBoundary({
    snapshotId,
    snapshot,
    runId,
    phase,
  });

  let boundSnapshot = bound.snapshot;
  try {
    const { attachG1Catalogs } = require('../knowledge/attachG1Catalogs');
    const attachInput = {
      ...boundSnapshot,
      pack,
      staffingPlan: boundSnapshot.staffingPlan || pack?.staffingPlan,
      requirementSkills:
        boundSnapshot.requirementSkills || pack?.requirementSkills,
    };
    boundSnapshot = attachG1Catalogs(attachInput).snapshot;
  } catch {
    /* keep boundary snapshot */
  }

  const p = String(phase || '').trim().toLowerCase();
  if (p === PHASE_HOW || p === 'phase_how') {
    const howOpts = {
      container: resumeState?.container || container,
      pack: resumeState?.pack || pack,
      toolData: resumeState?.toolData || toolData,
      snapshotId: bound.snapshotId,
      runId,
      onProgress,
      onCheckpoint,
      snapshot: boundSnapshot,
      resumeState,
      selectiveToolNames,
      budget,
      goal,
      constraints,
    };
    if (isAgentCoreF2Enabled()) {
      const { runHowPhaseLangGraph } = require('./runHowPhaseLangGraph');
      return runHowPhaseLangGraph(howOpts);
    }
    console.info(`[agent_core] mode=js runId=${runId || ''}`);
    return runHowPhase(howOpts);
  }
  if (p === PHASE_WHAT || p === 'phase_what') {
    const whatOpts = {
      container,
      pack,
      snapshot: boundSnapshot,
      snapshotId: bound.snapshotId,
      runId,
      onProgress,
      onCheckpoint,
      g4Opts,
      budget,
      goal,
      constraints,
    };
    if (isAgentCoreF2Enabled()) {
      const { runWhatPhaseLangGraph } = require('./runWhatPhaseLangGraph');
      return runWhatPhaseLangGraph(whatOpts);
    }
    return runWhatPhase(whatOpts);
  }
  const err = new Error(`Unsupported agent phase: ${phase}`);
  err.code = 'AGENT_PHASE_UNSUPPORTED';
  throw err;
}

async function runHowPhase({
  container,
  pack,
  toolData,
  snapshot = null,
  snapshotId,
  runId,
  onProgress,
  onCheckpoint,
  resumeState = null,
  selectiveToolNames = null,
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
}) {
  const startedAt = Date.now();
  const isSelective =
    Array.isArray(selectiveToolNames) && selectiveToolNames.length > 0;

  const budget = resolveAgentBudget({
    budget: budgetOverride || resumeState?.budget || undefined,
  });
  const initialFields = buildInitialAgentFields({
    phase: PHASE_HOW,
    runId,
    snapshotId,
    goal: goalOverride || resumeState?.goal || resumeState?.currentGoal,
    constraints: constraintsOverride || resumeState?.constraints,
    budget,
  });

  let next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { planning: {}, resource: {}, analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;

  let pinnedToolData = toolData && typeof toolData === 'object' ? toolData : {};
  let pinnedPack = pack && typeof pack === 'object' ? pack : {};
  let corpus =
    Array.isArray(resumeState?.corpus) && resumeState.corpus.length
      ? resumeState.corpus
      : [];

  const history = Array.isArray(resumeState?.history) ? [...resumeState.history] : [];
  const toolResults = Array.isArray(resumeState?.toolResults)
    ? [...resumeState.toolResults]
    : [];
  let contextPackage = resumeState?.contextPackage || null;
  let stopReason = resumeState?.stopReason || null;
  let feasibilitySignal = resumeState?.feasibilitySignal || null;

  const pinFields = () => ({
    toolData: pinnedToolData,
    pack: pinnedPack,
    container: next,
    corpus,
    goal: initialFields.goal,
    currentGoal: initialFields.currentGoal,
    constraints: initialFields.constraints,
    budget,
    stopReason,
    feasibilitySignal,
  });

  async function persist(currentNode, extra = {}) {
    if (!onCheckpoint) return;
    await onCheckpoint({
      runId,
      snapshotId,
      job: 'phase_how',
      currentNode,
      iteration: history.length,
      history: [...history],
      toolResults: [...toolResults],
      contextPackage,
      status: 'running',
      hitl: 'gate2',
      selectiveReplanSteps: isSelective ? selectiveToolNames : null,
      ...pinFields(),
      ...extra,
    });
  }

  // RULE-SEL-01: selective skips understand / G7 ingest
  if (!isSelective) {
    const preStop = evaluateStopCondition({
      budget,
      startedAt,
      iteration: history.length,
      toolCallCount: toolResults.length,
    });
    if (preStop.stop) {
      stopReason = preStop.reason;
      history.push(`stop:${stopReason}`);
    } else {
      onProgress?.({ node: 'understand', phase: PHASE_HOW });
      corpus = buildCorpusFromSnapshot(snapshot);
      let ingestWarning = null;
      try {
        const { ingestSnapshotToQdrant } = require('../retrieval/ingestSnapshotToQdrant');
        const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
        const mode = getG7RagMode();
        if ((mode === 'qdrant' || mode === 'hybrid') && snapshotId) {
          await ingestSnapshotToQdrant({ snapshot, snapshotId });
        }
      } catch (ingestErr) {
        const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
        const mode = getG7RagMode();
        if (mode === 'qdrant') {
          console.error('[g7_ingest] fail-closed', ingestErr?.message || ingestErr);
          throw ingestErr;
        }
        ingestWarning = String(ingestErr?.message || ingestErr);
        console.warn('[g7_ingest] soft', ingestWarning);
      }
      contextPackage = await assembleContextPackageAsync({
        query: 'how_planning',
        corpus,
        snapshotId,
      });
      if (ingestWarning && contextPackage && typeof contextPackage === 'object') {
        contextPackage.ingestWarning = ingestWarning;
      }
      history.push('understand');
      await persist('understand');

      onProgress?.({
        node: 'plan',
        phase: PHASE_HOW,
        tools: HOW_PHASE_TOOL_STEPS.map((s) => s.toolName),
      });
      history.push('plan');
      await persist('plan');

      onProgress?.({ node: 'select', phase: PHASE_HOW });
      history.push('select');
      await persist('select');
    }
  } else if (!corpus.length) {
    corpus = buildCorpusFromSnapshot(snapshot);
  }

  const steps = resolveHowSteps(selectiveToolNames);
  let startIndex = 0;
  if (
    !isSelective &&
    resumeState &&
    typeof resumeState.currentToolIndex === 'number' &&
    resumeState.currentToolIndex > 0
  ) {
    startIndex = resumeState.currentToolIndex;
  }
  // Selective always starts at 0 of its own step list (index cleared on feedback)
  if (isSelective) startIndex = 0;

  if (!stopReason) {
    onProgress?.({
      node: 'execute',
      phase: PHASE_HOW,
      selective: isSelective,
      startIndex,
    });

    const seq = await runHowToolLoop({
      steps,
      startIndex,
      container: next,
      pack: pinnedPack,
      toolData: pinnedToolData,
      snapshotId,
      budget,
      startedAt,
      baseIteration: history.length,
      onToolDone: async ({ nextIndex, toolName, container: c, toolResults: tr, history: h }) => {
        next = c;
        toolResults.length = 0;
        toolResults.push(...tr);
        // Replace execute:* history suffix carefully: keep pre-execute history
        const baseHistory = history.filter((x) => !String(x).startsWith('execute:'));
        history.length = 0;
        history.push(...baseHistory, ...h);
        await persist('execute', {
          currentToolIndex: nextIndex,
          currentToolName: toolName,
        });
      },
    });
    next = seq.container;
    toolResults.length = 0;
    toolResults.push(...seq.toolResults);
    const baseHistory = history.filter(
      (x) => !String(x).startsWith('execute:') && !String(x).startsWith('stop:')
    );
    history.length = 0;
    history.push(...baseHistory, ...seq.history);
    if (seq.stopReason) stopReason = seq.stopReason;
  }

  onProgress?.({ node: 'observe', phase: PHASE_HOW });
  history.push('observe');

  onProgress?.({ node: 'evaluateLocal', phase: PHASE_HOW });
  const tasks = Array.isArray(next.planning?.tasks) ? next.planning.tasks : [];
  const evaluate = {
    kind: 'evaluate_local',
    enoughInfoToContinue: tasks.length > 0 || toolResults.length > 0,
    reason: tasks.length > 0 ? 'tasks_present' : 'engines_completed',
  };
  const evaluateDecision = decideEvaluateAction({
    evaluate,
    contextPackage,
    toolResults,
  });
  evaluate.action = evaluateDecision.action;
  if (evaluateDecision.action === 'RETRIEVE' && !isSelective && !stopReason) {
    const enriched = await assembleContextPackageAsync({
      query: evaluateDecision.query || 'how_planning_gap',
      corpus: buildCorpusFromSnapshot(snapshot),
      snapshotId,
    });
    contextPackage = enriched;
    history.push('retrieve:evaluate');
  } else if (evaluateDecision.action === 'NEED_TOOL' && !stopReason) {
    // Wave F: record NEED_TOOL; JS prep does not spawn LangGraph — exit to G13 candidate
    history.push('need_tool:evaluate');
    evaluate.deferredToExit = true;
  }
  history.push('evaluateLocal');

  // Track B lỗ #6: early feasibility = signal in state only (≠ Gate2 G13 SoT)
  onProgress?.({ node: 'feasibility', phase: PHASE_HOW });
  feasibilitySignal = buildFeasibilitySignal({
    toolResults,
    container: next,
    runId,
    snapshotId,
  });
  const feasibility = signalToG13Candidate(feasibilitySignal, { runId, snapshotId });
  history.push('feasibilitySignal');

  if (!stopReason) {
    stopReason = STOP_REASONS.COMPLETE;
  }

  next.phaseRuns = {
    ...(next.phaseRuns || {}),
    phase_how: {
      ...(next.phaseRuns?.phase_how || {}),
      status: 'ready',
      remoteRunId: runId || null,
      snapshotId: snapshotId || null,
      hitl: 'gate2',
      selective: isSelective || undefined,
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt),
      error: null,
      stopReason,
      feasibilitySignal,
      // Gate2 reads feasibility as G13 candidate (override still on project)
      feasibility,
    },
  };
  if (next.jobs != null) delete next.jobs;

  const phaseOut = {
    phase: PHASE_HOW,
    container: next,
    history,
    toolResults,
    contextPackage,
    evaluate,
    feasibilitySignal,
    feasibility,
    goal: initialFields.goal,
    constraints: initialFields.constraints,
    budget,
    stopReason,
    hitl: 'gate2',
    durationMs: Math.max(0, Date.now() - startedAt),
    selective: isSelective,
    agentCore: 'js',
  };
  await persist('feasibility', {
    evaluationResult: evaluate,
    feasibilitySignal,
    feasibility,
    phaseOut,
    status: 'callback_pending',
    currentToolIndex: steps.length,
    currentToolName: null,
    selectiveReplanSteps: null,
    stopReason,
  });
  return phaseOut;
}

/**
 * WHAT phase — G4 Understanding (projection → LLM → tool → validate).
 */
async function runWhatPhase({
  container,
  pack = {},
  snapshot = null,
  snapshotId = null,
  runId = null,
  onProgress = null,
  onCheckpoint = null,
  g4Opts = {},
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
} = {}) {
  const startedAt = Date.now();
  const budget = resolveAgentBudget({ budget: budgetOverride || undefined });
  const initialFields = buildInitialAgentFields({
    phase: PHASE_WHAT,
    runId,
    snapshotId,
    goal: goalOverride,
    constraints: constraintsOverride,
    budget,
  });
  const next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;
  const history = [];
  const toolResults = [];
  let contextPackage = null;
  let stopReason = null;
  let feasibilitySignal = null;

  async function persist(currentNode, extra = {}) {
    if (!onCheckpoint) return;
    await onCheckpoint({
      runId,
      snapshotId,
      job: 'phase_what',
      currentNode,
      iteration: history.length,
      history: [...history],
      toolResults: [...toolResults],
      contextPackage,
      status: 'running',
      hitl: 'gate1',
      pack,
      container: next,
      goal: initialFields.goal,
      currentGoal: initialFields.currentGoal,
      constraints: initialFields.constraints,
      budget,
      stopReason,
      feasibilitySignal,
      ...extra,
    });
  }

  const preStop = evaluateStopCondition({
    budget,
    startedAt,
    iteration: 0,
    toolCallCount: 0,
  });
  if (preStop.stop) {
    stopReason = preStop.reason;
    history.push(`stop:${stopReason}`);
  }

  if (!stopReason) {
    onProgress?.({ node: 'understand', phase: PHASE_WHAT });
    history.push('understand');

    // Track A: never rebuild from pack alone — boundary already enforced
    const snapshotPayload =
      snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
        ? snapshot
        : null;
    if (!snapshotPayload) {
      const err = new Error('Snapshot payload required for WHAT phase (Track A)');
      err.code = 'SNAPSHOT_PAYLOAD_REQUIRED';
      throw err;
    }

    const snapshotCorpus = buildCorpusFromSnapshot(snapshotPayload);
    const fallbackPackText = String(
      snapshotPayload?.overview?.requirementName ||
        pack?.overview?.requirementName ||
        ''
    );
    try {
      const { ingestSnapshotToQdrant } = require('../retrieval/ingestSnapshotToQdrant');
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if ((mode === 'qdrant' || mode === 'hybrid') && snapshotId) {
        await ingestSnapshotToQdrant({ snapshot: snapshotPayload, snapshotId });
      }
    } catch (ingestErr) {
      const { getG7RagMode } = require('../retrieval/g7PipelineSchemas');
      const mode = getG7RagMode();
      if (mode === 'qdrant') throw ingestErr;
      console.warn('[g7_ingest] what soft', ingestErr?.message || ingestErr);
    }
    contextPackage = await assembleContextPackageAsync({
      query: 'what_requirements',
      corpus: snapshotCorpus.length
        ? snapshotCorpus
        : fallbackPackText
          ? [{ id: 'snap_overview', text: fallbackPackText }]
          : [],
      snapshotId,
    });
    await persist('understand', { corpus: snapshotCorpus });

    onProgress?.({ node: 'plan', phase: PHASE_WHAT });
    history.push('plan');
    await persist('plan');

    onProgress?.({ node: 'execute', phase: PHASE_WHAT, tool: 'RequirementAnalysisTool' });
    const { runG4Understanding } = require('../engines/g4Understanding');
    const g4Out = await runG4Understanding({
      snapshot: snapshotPayload,
      pack,
      ...g4Opts,
    });
    history.push('execute:g4');

    onProgress?.({ node: 'observe', phase: PHASE_WHAT });
    history.push('observe');

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
    toolResults.push({
      toolName: 'RequirementAnalysisTool',
      facts: g4Understanding.facts || {},
    });
    await persist('execute:g4', { g4Understanding, conflictAmbiguityGate });

    next.analyses = {
      ...(next.analyses || {}),
      g4Understanding,
    };
    next.phaseRuns = {
      ...(next.phaseRuns || {}),
      phase_what: {
        ...(next.phaseRuns?.phase_what || {}),
        status: 'ready',
        mode: 'g4',
        remoteRunId: runId || null,
        snapshotId: snapshotId || null,
        generatedAt: new Date().toISOString(),
        durationMs: g4Understanding.meta?.durationMs ?? Math.max(0, Date.now() - startedAt),
        error: g4Understanding.meta?.lastError || null,
        partial: Boolean(g4Understanding.meta?.partial),
        conflictAmbiguityGate,
      },
    };

    onProgress?.({ node: 'evaluateLocal', phase: PHASE_WHAT });
    const evaluate = {
      kind: 'evaluate_local',
      enoughInfoToContinue: Array.isArray(g4Understanding.requirements)
        ? g4Understanding.requirements.length > 0
        : false,
      reason: 'g4_understanding',
    };
    const evaluateDecision = decideEvaluateAction({
      evaluate,
      contextPackage,
      toolResults,
    });
    evaluate.action = evaluateDecision.action;
    if (evaluateDecision.action === 'NEED_TOOL') {
      history.push('need_tool:evaluate');
      evaluate.deferredToExit = true;
    } else if (evaluateDecision.action === 'RETRIEVE') {
      history.push('retrieve:evaluate');
    }
    history.push('evaluateLocal');

    onProgress?.({ node: 'feasibility', phase: PHASE_WHAT });
    feasibilitySignal = buildFeasibilitySignal({
      toolResults,
      container: next,
      runId,
      snapshotId,
    });
    // WHAT does not own Gate2 G13; signal only (coverage from G4)
    const feasibility = checkFeasibility({
      runId,
      snapshotId,
      coverageOk: evaluate.enoughInfoToContinue,
    });
    history.push('feasibilitySignal');
    stopReason = STOP_REASONS.COMPLETE;

    const phaseOut = {
      phase: PHASE_WHAT,
      container: next,
      history,
      toolResults,
      contextPackage,
      g4Understanding,
      evaluate,
      feasibilitySignal,
      feasibility,
      goal: initialFields.goal,
      constraints: initialFields.constraints,
      budget,
      stopReason,
      hitl: 'gate1',
      durationMs: Math.max(0, Date.now() - startedAt),
      stub: false,
    };
    await persist('feasibility', {
      evaluationResult: evaluate,
      feasibilitySignal,
      feasibility,
      g4Understanding,
      phaseOut,
      status: 'callback_pending',
      stopReason,
    });
    return phaseOut;
  }

  // Budget stop before WHAT work
  stopReason = stopReason || STOP_REASONS.BUDGET_WALL;
  const emptyEvaluate = {
    kind: 'evaluate_local',
    enoughInfoToContinue: false,
    reason: 'budget_stop',
    action: 'CONTINUE',
  };
  feasibilitySignal = buildFeasibilitySignal({
    toolResults,
    container: next,
    runId,
    snapshotId,
  });
  const feasibility = checkFeasibility({
    runId,
    snapshotId,
    coverageOk: false,
  });
  next.phaseRuns = {
    ...(next.phaseRuns || {}),
    phase_what: {
      ...(next.phaseRuns?.phase_what || {}),
      status: 'stopped',
      remoteRunId: runId || null,
      snapshotId: snapshotId || null,
      stopReason,
      generatedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt),
      error: stopReason,
    },
  };
  const phaseOut = {
    phase: PHASE_WHAT,
    container: next,
    history,
    toolResults,
    contextPackage,
    evaluate: emptyEvaluate,
    feasibilitySignal,
    feasibility,
    goal: initialFields.goal,
    constraints: initialFields.constraints,
    budget,
    stopReason,
    hitl: 'gate1',
    durationMs: Math.max(0, Date.now() - startedAt),
    stub: false,
  };
  await persist('feasibility', {
    evaluationResult: emptyEvaluate,
    feasibilitySignal,
    feasibility,
    phaseOut,
    status: 'callback_pending',
    stopReason,
  });
  return phaseOut;
}

module.exports = {
  runAgentPhase,
  HOW_PHASE_TOOL_NAMES,
  /** @deprecated alias — use HOW_PHASE_TOOL_NAMES */
  HOW_PHASE_JOBS: HOW_PHASE_TOOL_NAMES,
  PHASE_HOW,
  PHASE_WHAT,
};
