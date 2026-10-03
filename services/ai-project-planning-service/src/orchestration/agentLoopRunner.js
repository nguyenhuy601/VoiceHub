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
const { buildLoop1ChildHistory } = require('../contracts/loopStateContract');
const {
  mergeGenerationHealth,
  buildGenerationHealthFromMeta,
} = require('../contracts/generationHealthContract');
const { normalizeGenerationId } = require('../contracts/runLineageContract');

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
  humanFeedback = null,
  parentRunId = null,
  generationId = null,
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
      parentRunId,
      generationId: generationId || normalizeGenerationId(runId),
      onProgress,
      onCheckpoint,
      g4Opts,
      budget,
      goal,
      constraints,
      humanFeedback: humanFeedback || null,
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
      onToolStart: async ({ toolName }) => {
        await onProgress?.({
          node: 'call_tool',
          phase: PHASE_HOW,
          tool: toolName,
        });
      },
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
  humanFeedback = null,
  parentRunId = null,
  generationId = null,
} = {}) {
  const startedAt = Date.now();
  const budget = resolveAgentBudget({ budget: budgetOverride || undefined });
  const feedbackText = String(
    humanFeedback?.rawText ||
      humanFeedback?.text ||
      g4Opts.humanFeedback?.rawText ||
      g4Opts.humanFeedback?.text ||
      ''
  ).trim();
  const isLoop1 = Boolean(
    feedbackText &&
      (humanFeedback?.kind === 'requirement_feedback' ||
        g4Opts.loop1Reenter ||
        humanFeedback)
  );
  const resolvedGenerationId =
    normalizeGenerationId(generationId) || normalizeGenerationId(runId);
  const initialFields = buildInitialAgentFields({
    phase: PHASE_WHAT,
    runId,
    snapshotId,
    goal: goalOverride,
    constraints: constraintsOverride,
    budget,
  });
  if (isLoop1 && feedbackText) {
    initialFields.currentGoal = `Gate1 Loop1 revise: ${feedbackText.slice(0, 400)}`;
    const prev = Array.isArray(initialFields.constraints)
      ? [...initialFields.constraints]
      : [];
    prev.push({ type: 'loop1_feedback', text: feedbackText.slice(0, 2000) });
    initialFields.constraints = prev;
  }
  const next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;
  // Loop1: seed transition triad on child (never stamp parent CP)
  const history = isLoop1 ? buildLoop1ChildHistory() : [];
  const toolResults = [];
  let contextPackage = null;
  let corpusContentHash = g4Opts.priorCorpusHash || null;
  let stopReason = null;
  let feasibilitySignal = null;
  let generationHealth = null;

  async function persist(currentNode, extra = {}) {
    if (!onCheckpoint) return;
    await onCheckpoint({
      runId,
      snapshotId,
      parentRunId: parentRunId || null,
      generationId: resolvedGenerationId,
      generationHealth,
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
      humanFeedback:
        humanFeedback ||
        (feedbackText
          ? { kind: 'requirement_feedback', source: 'gate1', rawText: feedbackText }
          : null),
      lastFeedback: feedbackText || null,
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

  const snapshotPayload =
    snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
      ? snapshot
      : null;
  if (!stopReason && !snapshotPayload) {
    const err = new Error('Snapshot payload required for WHAT phase (Track A)');
    err.code = 'SNAPSHOT_PAYLOAD_REQUIRED';
    throw err;
  }

  let understandingPartial = null;
  const reusePartial =
    isLoop1 &&
    g4Opts.priorPartial &&
    typeof g4Opts.priorPartial === 'object' &&
    g4Opts.priorPartial.selection &&
    g4Opts.priorPartial.projected;
  const reuseContext =
    isLoop1 && g4Opts.reuseContextPackage && typeof g4Opts.reuseContextPackage === 'object';

  if (!stopReason) {
    // --- Step 1: Input ---
    await onProgress?.({
      step: 1,
      substep: 'prepare',
      node: 'prepare',
      phase: PHASE_WHAT,
    });

    if (reusePartial && reuseContext) {
      // RULE-R03 Loop 1: re-enter Step 4 with Agent State reuse (skip Step 2/3)
      understandingPartial = g4Opts.priorPartial;
      contextPackage = g4Opts.reuseContextPackage;
      history.push('loop1:reenter_step4', 'step2:skipped', 'step3:skipped');
      await persist('loop1:reenter_step4', {
        understandingPartial,
        humanFeedback,
      });
      console.info(
        `[phase_what] loop1 feedbackApplied reenter=step4 runId=${runId || ''}`
      );
    } else {
      // --- Step 2: Requirement Understanding (parse…quality only) ---
      const { resolveAiG4Policy } = require('../config/aiG4Policy');
      const { runUnderstandPrefix } = require('../engines/g4/runG4Pipeline');
      const policy = resolveAiG4Policy(g4Opts.env || process.env);
      understandingPartial = await runUnderstandPrefix(
        {
          onProgress: async (evt) => {
            if (!onProgress) return;
            await onProgress({
              ...evt,
              phase: PHASE_WHAT,
              node: evt.substep || evt.node,
            });
          },
        },
        policy,
        snapshotPayload
      );
      history.push('step2:understanding');
      await persist('step2:understanding', { understandingPartial });
      // Step 3 (Qdrant ingest + context) owned by G4 after quality (RULE-DL-09)
      if (isLoop1) {
        history.push('loop1:reenter_step4');
        console.info(
          `[phase_what] loop1 feedbackApplied full_prepare_then_step4 runId=${runId || ''}`
        );
      }
    }

    // --- Step 4 markers (node-only until G4 finishes Step 3 progress) ---
    // RULE-P01: do not advance business step to 4 before semantic/conflict (step 3)
    // or those events are dropped as backward_substep.
    await onProgress?.({
      node: 'agent_understand',
      phase: PHASE_WHAT,
    });
    history.push('agent_understand');
    await onProgress?.({
      node: 'plan',
      phase: PHASE_WHAT,
    });
    history.push('plan');
    await persist('plan', {
      currentGoal: initialFields.currentGoal,
      constraints: initialFields.constraints,
      humanFeedback: humanFeedback || null,
    });
  }

  if (!stopReason) {
    await onProgress?.({
      node: 'execute',
      phase: PHASE_WHAT,
      tool: 'RequirementAnalysisTool',
    });
    const { runFrSemanticTask } = require('../semantic/runFrSemanticTask');
    const frSem = await runFrSemanticTask({
      snapshot: snapshotPayload,
      pack,
      g4Opts: {
        ...g4Opts,
        pauseAtDataGate: false,
        loop1Reenter: Boolean(isLoop1 || g4Opts.loop1Reenter),
        // Skip Step 2 prefix inside G4 — already done above / Loop1 reuse
        priorPartial: understandingPartial,
        priorCorpusHash: corpusContentHash,
        snapshotId,
        reuseContextPackage: contextPackage,
      },
      runId,
      onProgress: async (evt) => {
        if (!onProgress) return;
        await onProgress({
          ...evt,
          phase: PHASE_WHAT,
          node: evt.substep || evt.node,
          tool: evt.tool != null ? evt.tool : null,
        });
      },
    });
    const g4Out = frSem.g4Out || frSem.meta?.g4Out || {};
    if (g4Out.contextPackage) contextPackage = g4Out.contextPackage;
    if (g4Out.corpusContentHash) corpusContentHash = g4Out.corpusContentHash;
    history.push('step3:semantic_fetch');
    if (frSem.blocked || g4Out?.blocked) {
      history.push('execute:g4:blocked');
      stopReason = g4Out.errorCode || STOP_REASONS.COMPLETE;
      const phaseBlocked = {
        phase: PHASE_WHAT,
        container: next,
        history,
        toolResults,
        contextPackage,
        g4Understanding: {
          requirements: [],
          meta: { blocked: true, errorCode: g4Out.errorCode },
          conflictAmbiguityGate: { passed: false, reason: g4Out.errorCode },
        },
        proposalFragment: null,
        hitl: 'gate1',
        stopReason,
        durationMs: Math.max(0, Date.now() - startedAt),
        stub: false,
        errorCode: g4Out.errorCode,
      };
      return phaseBlocked;
    }
    history.push('execute:g4', 'semantic_task:fr');

    onProgress?.({
      node: 'observe',
      phase: PHASE_WHAT,
      step: 4,
      substep: 'observe',
    });
    history.push('observe');

    const conflictAmbiguityGate = frSem.conflictAmbiguityGate;
    const g4Understanding = frSem.g4Understanding;
    generationHealth = mergeGenerationHealth(
      generationHealth,
      buildGenerationHealthFromMeta({
        partial: Boolean(g4Understanding?.meta?.partial || frSem.partial),
        llmFailed: Boolean(g4Understanding?.meta?.llmFailed),
        task: 'semantic',
        coverage: g4Understanding?.meta?.coverage || null,
        failedTasks: g4Understanding?.meta?.failedTasks,
      })
    );
    toolResults.push({
      toolName: 'RequirementAnalysisTool',
      facts: g4Understanding?.facts || {},
    });
    await persist('execute:g4', {
      g4Understanding,
      conflictAmbiguityGate,
      generationHealth,
    });

    // W0+: do not persist analyses.g4Understanding — callback reduces to srsProposal
    const proposalFragment = frSem.proposalFragment || null;
    if (next.analyses?.g4Understanding) delete next.analyses.g4Understanding;

    let srsProposal = null;
    try {
      const { finalizeWhatSrsProposal } = require('./finalizeWhatSrsProposal');
      const finalized = await finalizeWhatSrsProposal({
        proposalFragment,
        pack,
        snapshot,
        rawRecord: pack?.aiAnalysis?.analyses?.customerRawRecord || null,
        runId,
        onProgress,
        g4Understanding,
      });
      srsProposal = finalized.srsProposal;
      if (srsProposal) {
        next.analyses = { ...(next.analyses || {}), srsProposal };
      }
    } catch (pipeErr) {
      console.warn('[phase_what] analysis engine pipeline failed', pipeErr?.message || pipeErr);
      // RAW_DERIVE_FAILED: abort phase_what → failed callback → FE toast + thoát chạy
      if (pipeErr?.code === 'RAW_DERIVE_FAILED') {
        throw pipeErr;
      }
    }

    next.phaseRuns = {
      ...(next.phaseRuns || {}),
      phase_what: {
        ...(next.phaseRuns?.phase_what || {}),
        status: 'ready',
        mode: 'requirement',
        remoteRunId: runId || null,
        snapshotId: snapshotId || null,
        generatedAt: new Date().toISOString(),
        durationMs: g4Understanding.meta?.durationMs ?? Math.max(0, Date.now() - startedAt),
        error: g4Understanding.meta?.lastError || null,
        partial: Boolean(g4Understanding.meta?.partial),
        conflictAmbiguityGate,
        requirementIntegrityGate:
          frSem.requirementIntegrityGate || conflictAmbiguityGate || null,
        computeStatus: 'completed',
        callbackStatus: 'pending',
        stage: 'finalizing',
        llm: g4Understanding.meta?.llm || null,
        candidateCount: g4Understanding.meta?.candidateCount ?? null,
        readyForGate1: Boolean(srsProposal?.completeness?.readyForGate1),
        analysisEngineGraph: true,
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

    onProgress?.({
      node: 'feasibility',
      phase: PHASE_WHAT,
      step: 4,
      // Step 4 UI ends at meta_gate; feasibility is internal finalize
      substep: 'meta_gate',
    });
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

    // S6: engine/meta success must not clear prior partial
    generationHealth = mergeGenerationHealth(generationHealth, {
      partial: false,
      failedTasks: [],
    });

    // PLAN B: durable Loop1 reuse (pack), not parent G15 checkpoint
    const { buildLoop1ReuseArtifact } = require('../knowledge/loop1ReuseArtifact');
    const loop1Reuse = buildLoop1ReuseArtifact({
      snapshotId,
      sourceRunId: runId,
      corpusContentHash,
      contextPackage,
      priorPartial: understandingPartial,
    });
    if (loop1Reuse) {
      next.phaseRuns = {
        ...(next.phaseRuns || {}),
        phase_what: {
          ...(next.phaseRuns?.phase_what || {}),
          loop1Reuse,
        },
      };
    }

    const phaseOut = {
      phase: PHASE_WHAT,
      container: next,
      history,
      toolResults,
      contextPackage,
      corpusContentHash,
      loop1Reuse,
      understandingPartial,
      g4Understanding,
      proposalFragment,
      srsProposal,
      evaluate,
      feasibilitySignal,
      feasibility,
      goal: initialFields.goal,
      constraints: initialFields.constraints,
      budget,
      stopReason,
      generationHealth,
      parentRunId: parentRunId || null,
      generationId: resolvedGenerationId,
      hitl: 'gate1',
      durationMs: Math.max(0, Date.now() - startedAt),
      stub: false,
    };
    await persist('feasibility', {
      evaluationResult: evaluate,
      feasibilitySignal,
      feasibility,
      g4Understanding,
      generationHealth,
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
