/**
 * Pattern B sec/section tool subgraphs — shared∪private + applyShared to parent channels.
 */

const { Annotation, StateGraph, START, END } = require('@langchain/langgraph');
const {
  SEC_SHARED_KEYS,
  appendList,
  mergeCurrentToolName,
  deepMergePlanningContainers,
  preferRight,
} = require('./sharedPhaseChannels');

function field() {
  // Parallel Send fan-out: subgraphs echo shared inputs → must not be bare LastValue.
  return Annotation({ reducer: preferRight });
}

/** Shared Annotation slice for HOW/WHAT sec tool subgraphs (Pattern B). */
function buildSecSharedAnnotations() {
  return {
    pack: field(),
    container: Annotation({
      reducer: (left, right) => {
        if (right == null) return left;
        return deepMergePlanningContainers(left, right);
      },
    }),
    toolData: field(),
    snapshot: field(),
    snapshotId: field(),
    env: field(),
    contextPackage: field(),
    runId: field(),
    toolResults: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    history: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    messages: Annotation({
      reducer: appendList,
      default: () => [],
    }),
    currentToolName: Annotation({
      reducer: mergeCurrentToolName,
    }),
  };
}

/**
 * Sec ran but produced no usable artifact (e.g. Dependency before Wbs leaves).
 * Dependency: empty edges alone are NOT incomplete — status matrix in dependencyValidation.
 */
function isHowSecResultIncomplete(toolName, result) {
  const source = String(result?.meta?.source || result?.meta?.fallbackReason || '');
  if (source === 'semantic_incomplete') return true;
  if (toolName === 'DependencyTool') {
    try {
      const { assessDependencyResult } = require('../howSecs/dependencies/dependencyValidation');
      const assessment = assessDependencyResult(result, {
        container: null,
        allowTaskIds: null,
      });
      return assessment.status === 'incomplete';
    } catch {
      return false;
    }
  }
  return false;
}

function resolveDependencyExecutionStatus(result) {
  try {
    const { assessDependencyResult } = require('../howSecs/dependencies/dependencyValidation');
    const assessment = assessDependencyResult(result, {
      allowTaskIds: result?.meta?.analyzedTaskIds || null,
    });
    if (assessment.status === 'incomplete') {
      return { status: 'blocked', assessment };
    }
    if (assessment.status === 'skipped') {
      return { status: 'skipped', assessment };
    }
    // FAILED / INVALID / PARTIAL are terminal analysis outcomes (executionTerminal).
    // Do NOT emit TOOL_FAILED — that hard-stops HOW and blocks Risk. Schedule still
    // gates on scheduleReady; analysisStatus stays on the container for Gate2 UI.
    if (
      assessment.status === 'failed' ||
      assessment.status === 'partial' ||
      assessment.executionTerminal
    ) {
      return { status: 'succeeded', assessment };
    }
    return { status: 'succeeded', assessment };
  } catch {
    return { status: 'failed', assessment: null };
  }
}

function makeApplySharedNode(toolName) {
  return async function applyShared(state) {
    const {
      createToolExecution,
      executionToLegacyToolResult,
      attemptCountForTool,
      hashToolInput,
      ERROR_CODES,
    } = require('./toolExecutionContract');
    const patch = state.containerPatch;
    const result = state.result;
    const attempt = attemptCountForTool(state, toolName) + 1;
    const resultInputHash = result?.inputHash || result?.meta?.inputHash || null;
    const inputHash =
      resultInputHash ||
      hashToolInput(toolName, {
        snapshotId: state.snapshotId,
        resultMeta: result?.meta?.source || null,
        analysisStatus: result?.analysisStatus || result?.meta?.analysisStatus || null,
        wbsVersion: result?.wbsVersion || result?.meta?.wbsVersion || null,
      });

    // Stale Dependency patch: container WBS changed under us
    let applyPatch = patch && typeof patch === 'object' && Object.keys(patch).length > 0;
    if (toolName === 'DependencyTool' && applyPatch) {
      const existing = state.container?.analyses?.dependency || {};
      const incomingWbs = result?.wbsVersion || result?.meta?.wbsVersion;
      const existingWbs = existing.wbsVersion || existing.meta?.wbsVersion;
      if (
        existing.inputHash &&
        resultInputHash &&
        existing.inputHash === resultInputHash &&
        existingWbs &&
        incomingWbs &&
        existingWbs === incomingWbs
      ) {
        // Idempotent re-apply — still merge (replace same namespace)
        applyPatch = true;
      }
      if (existingWbs && incomingWbs && existingWbs !== incomingWbs && existing.inputHash === resultInputHash) {
        applyPatch = false;
      }
    }

    let execution;
    if (result == null) {
      execution = createToolExecution({
        toolName,
        status: 'failed',
        attempt,
        inputHash,
        outputValidated: false,
        error: {
          code: ERROR_CODES.TOOL_RESULT_MISSING,
          retryable: true,
          message: `${toolName} subgraph returned undefined result`,
        },
      });
    } else if (toolName === 'DependencyTool') {
      const resolved = resolveDependencyExecutionStatus(result);
      const status = resolved.status;
      execution = createToolExecution({
        toolName,
        status,
        attempt,
        inputHash,
        outputValidated: status === 'succeeded' || status === 'skipped',
        outputRef: status === 'succeeded' || status === 'skipped' ? `${toolName}:${inputHash}` : undefined,
        reason: result?.analysisStatus || result?.meta?.analysisStatus || result?.meta?.source,
        blockedBy:
          status === 'blocked' ? ['upstream_or_coverage', 'dependency_incomplete'] : undefined,
        error:
          status === 'failed'
            ? {
                code: ERROR_CODES.TOOL_FAILED,
                retryable: false,
                message: String(result?.analysisStatus || result?.meta?.source || 'dependency_failed'),
              }
            : undefined,
        startedAt: new Date().toISOString(),
      });
    } else {
      const incomplete = isHowSecResultIncomplete(toolName, result);
      if (incomplete) {
        execution = createToolExecution({
          toolName,
          status: 'blocked',
          attempt,
          inputHash,
          outputValidated: false,
          reason: result?.meta?.source || 'semantic_incomplete',
          blockedBy: ['upstream_or_coverage'],
        });
      } else {
        execution = createToolExecution({
          toolName,
          status: 'succeeded',
          attempt,
          inputHash,
          outputValidated: true,
          outputRef: `${toolName}:${inputHash}`,
          startedAt: new Date().toISOString(),
        });
      }
    }

    const legacy = executionToLegacyToolResult(execution);
    const update = {
      toolExecutions: [execution],
      toolResults: [legacy],
      history: [`execute:${toolName}:${execution.status}`],
      messages: [
        {
          role: 'tool',
          name: toolName,
          content: JSON.stringify({
            ok: execution.status === 'succeeded' || execution.status === 'skipped',
            status: execution.status,
            path: 'pattern_b_subgraph',
            analysisStatus: result?.analysisStatus || result?.meta?.analysisStatus || null,
            scheduleReady: result?.scheduleReady ?? result?.meta?.scheduleReady ?? null,
            executionTerminal: result?.executionTerminal ?? result?.meta?.executionTerminal ?? null,
            ...(execution.reason ? { reason: execution.reason } : {}),
          }),
        },
      ],
      currentToolName: toolName,
    };
    // Apply dependency patch on terminal outcomes so status flags reach container (Risk/Schedule gates).
    const terminalApply =
      execution.status === 'succeeded' ||
      execution.status === 'skipped' ||
      (toolName === 'DependencyTool' &&
        (execution.status === 'failed' || execution.status === 'blocked') &&
        result?.executionTerminal);
    if (terminalApply && applyPatch) {
      update.container = patch;
    }
    return update;
  };
}

/**
 * HOW sec tools that are compiled Pattern B subgraphs on the phase graph.
 */
const HOW_SEC_TOOL_NAMES = Object.freeze([
  'ArchitectureTool',
  'DependencyTool',
  'RiskTool',
  'QualityPlanTool',
  'DeployPlanTool',
  'EffortTool',
]);

const _howSecCache = new Map();

function buildArchitectureToolSubgraph() {
  const { buildArchitectureSemantic } = require('../howSecs/architecture/architectureSemantic');
  const { buildArchitectureFacts } = require('../howSecs/architecture/architectureFacts');
  const { proposeArchitectureWithLlm } = require('../howSecs/architecture/architecturePropose');
  const {
    acceptArchitectureProposal,
    toArchitectureEngineResult,
  } = require('../howSecs/architecture/architectureAccept');
  const { applyArchitectureToContainer } = require('../engines/architecture');

  const State = Annotation.Root({
    ...buildSecSharedAnnotations(),
    generateJsonFn: field(),
    semanticOut: field(),
    facts: field(),
    proposed: field(),
    result: field(),
    containerPatch: field(),
  });

  const graph = new StateGraph(State);
  graph.addNode('semantic', async (state) => ({
    semanticOut: buildArchitectureSemantic({
      pack: state.pack || {},
      container: state.container || {},
      toolData: state.toolData || {},
      snapshot: state.snapshot || null,
      env: state.env || process.env,
    }),
  }));
  graph.addNode('fact', async (state) => {
    const semOut = state.semanticOut;
    if (!semOut?.ok) {
      return { facts: { allowLists: semOut?.allowLists || {}, catalogFacts: [] } };
    }
    return {
      facts: buildArchitectureFacts({
        semantic: semOut.semantic,
        allowLists: semOut.allowLists,
      }),
    };
  });
  graph.addNode('propose', async (state) => {
    const semOut = state.semanticOut;
    if (!semOut?.ok) {
      return {
        proposed: {
          ok: false,
          data: null,
          skipped: true,
          meta: { fallbackReason: 'semantic_incomplete', llmCalls: 0 },
        },
      };
    }
    return {
      proposed: await proposeArchitectureWithLlm({
        semantic: semOut.semantic,
        facts: state.facts,
        env: state.env || process.env,
        generateJsonFn: state.generateJsonFn || null,
      }),
    };
  });
  graph.addNode('accept', async (state) => {
    const semOut = state.semanticOut || {};
    const proposed = state.proposed || {};
    const accepted = acceptArchitectureProposal({
      raw: proposed.ok ? proposed.data : { items: [], openQuestions: [] },
      semantic: semOut.semantic,
      facts: state.facts,
      openQuestionsIn: [
        ...(semOut.openQuestions || []),
        ...(semOut.ok
          ? []
          : [
              {
                code: 'ARCH_SEMANTIC_INCOMPLETE',
                message: `Thiếu semantic: ${(semOut.missingSlots || []).join(', ')}`,
              },
            ]),
        ...(proposed.ok
          ? []
          : [
              {
                code: 'ARCH_LLM_SKIP_OR_FAIL',
                message: proposed.meta?.fallbackReason || 'llm_unavailable',
              },
            ]),
      ],
    });
    const result = toArchitectureEngineResult(accepted, {
      model: proposed.meta?.model || null,
      llmCalls: proposed.meta?.llmCalls || 0,
    });
    if (!semOut.ok) result.meta.source = 'semantic_incomplete';
    else if (!proposed.ok) result.meta.llmFallback = proposed.meta?.fallbackReason;
    const containerPatch = applyArchitectureToContainer(state.container || {}, result);
    return { result, containerPatch };
  });
  graph.addNode('applyShared', makeApplySharedNode('ArchitectureTool'));
  graph.addEdge(START, 'semantic');
  graph.addEdge('semantic', 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', 'applyShared');
  graph.addEdge('applyShared', END);
  return graph.compile();
}

/**
 * Wrap an existing run*SecGraph invoke behind Pattern B outer graph:
 * outer nodes are Pattern B relative to phase; inner still used for registry compat
 * via run* helpers. For phase, we use dedicated builders where possible.
 *
 * Generic: one node "secPipeline" that is a *compiled inner graph* added via addNode (B).
 */
function buildSecToolSubgraphFromInner(toolName, buildInner) {
  const State = Annotation.Root({
    ...buildSecSharedAnnotations(),
    generateJsonFn: field(),
    planningHints: field(),
    // private bridge fields for inner I/O when inner schema differs
    result: field(),
    containerPatch: field(),
  });

  const inner = typeof buildInner === 'function' ? buildInner() : buildInner;
  const graph = new StateGraph(State);
  // Pattern B: nested compiled graph as node (shared keys overlap with State)
  graph.addNode('secPipeline', inner);
  graph.addNode('applyShared', makeApplySharedNode(toolName));
  graph.addEdge(START, 'secPipeline');
  graph.addEdge('secPipeline', 'applyShared');
  graph.addEdge('applyShared', END);
  return graph.compile();
}

function getHowSecToolSubgraph(toolName) {
  if (_howSecCache.has(toolName)) return _howSecCache.get(toolName);

  let compiled;
  if (toolName === 'ArchitectureTool') {
    compiled = buildArchitectureToolSubgraph();
  } else if (toolName === 'DependencyTool') {
    const { buildDependencySecGraph } = require('../howSecs/dependencies/dependencyGraph');
    compiled = enhanceSecGraphWithApplyShared(buildDependencySecGraph, 'DependencyTool');
  } else if (toolName === 'RiskTool') {
    const { buildRiskSecGraph } = require('../howSecs/risks/riskGraph');
    compiled = enhanceSecGraphWithApplyShared(buildRiskSecGraph, 'RiskTool');
  } else if (toolName === 'QualityPlanTool') {
    const { buildQualitySecGraph } = require('../howSecs/quality/qualityGraph');
    compiled = enhanceSecGraphWithApplyShared(buildQualitySecGraph, 'QualityPlanTool');
  } else if (toolName === 'DeployPlanTool') {
    const { buildDeploySecGraph } = require('../howSecs/deploy/deployGraph');
    compiled = enhanceSecGraphWithApplyShared(buildDeploySecGraph, 'DeployPlanTool');
  } else if (toolName === 'EffortTool') {
    const { buildEffortRolesSecGraph } = require('../howSecs/effortRoles/effortRolesGraph');
    compiled = enhanceSecGraphWithApplyShared(buildEffortRolesSecGraph, 'EffortTool');
  } else {
    throw new Error(`No Pattern B sec subgraph for ${toolName}`);
  }

  _howSecCache.set(toolName, compiled);
  return compiled;
}

/**
 * If buildFn returns a graph that already ends at accept→END, rebuild with applyShared
 * by requiring the module's low-level builder that returns uncompiled graph — fallback:
 * wrap via outer StateGraph + addNode(innerCompiled) Pattern B.
 */
function enhanceSecGraphWithApplyShared(buildFn, toolName) {
  // Prefer outer Pattern B shell: addNode(inner) + applyShared
  const inner = buildFn();
  return buildSecToolSubgraphFromInner(toolName, () => inner);
}

const _whatFrCache = new Map();

/**
 * Pattern B WHAT FR node — prepare (CR) → nested FR StateGraph → accept → applyShared.
 * Registered on whatPhaseGraph as `runFrUnderstanding` (Send when agent picks WhatFrTool).
 * @param {{ onProgress?: Function }} [hooks]
 */
function buildWhatFrToolSubgraph(hooks = {}) {
  const cacheKey = 'what-fr';
  if (_whatFrCache.has(cacheKey) && !hooks.onProgress && !hooks.bypassCache) {
    return _whatFrCache.get(cacheKey);
  }

  const { WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
  const { buildFrUnderstandingGraph } = require('../engines/frUnderstanding');
  const {
    prepareFrSnapshotForPipeline,
    finalizeFrSemanticFromPipeline,
  } = require('../semantic/runFrSemanticTask');
  const { applyFrToolToState, sparseContainerPatch } = require('./whatPhaseToolNodes');

  const frInner = buildFrUnderstandingGraph({ onProgress: hooks.onProgress || null });

  const State = Annotation.Root({
    ...buildSecSharedAnnotations(),
    frUnderstanding: field(),
    frOpts: field(),
    understandingPartial: field(),
    corpusContentHash: field(),
    srsProposal: field(),
    proposalFragment: field(),
    conflictAmbiguityGate: field(),
    requirementIntegrityGate: field(),
    engineResultsById: field(),
    semanticStatuses: field(),
    // FR pipeline inputs (shared with nested graph)
    priorPartial: field(),
    forceHeuristic: field(),
    skipLlm: field(),
    reuseContextPackage: field(),
    priorCorpusHash: field(),
    generateJsonFn: field(),
    // private bridge
    frSkipPipeline: field(),
    frFailClosed: field(),
    proposedByIdEntries: field(),
    frFromCrMeta: field(),
    projected: field(),
    validation: field(),
    selection: field(),
    blocked: field(),
    errorCode: field(),
    containerPatch: field(),
  });

  const graph = new StateGraph(State);

  graph.addNode('prepareFr', async (state) => {
    const env = state.env || process.env;
    const frOpts = {
      ...(state.frOpts || {}),
      pauseAtDataGate: false,
      priorCorpusHash: state.corpusContentHash || state.frOpts?.priorCorpusHash || null,
      snapshotId: state.snapshotId,
      priorPartial:
        state.frOpts?.priorPartial ||
        state.understandingPartial ||
        null,
    };
    const prepared = await prepareFrSnapshotForPipeline({
      snapshot: state.snapshot,
      pack: state.pack || {},
      frOpts,
      env,
      generateJsonFn: state.generateJsonFn || state.frOpts?.generateJsonFn || null,
    });

    if (prepared.failClosed) {
      return {
        frSkipPipeline: true,
        frFailClosed: prepared.failClosed,
        proposedByIdEntries: [],
        frFromCrMeta: prepared.frFromCrMeta,
      };
    }

    const proposedEntries = [...prepared.proposedById.entries()];
    return {
      frSkipPipeline: false,
      frFailClosed: null,
      snapshot: prepared.snapshot,
      pack: prepared.pack,
      priorPartial: prepared.frOpts.priorPartial || null,
      priorCorpusHash: prepared.frOpts.priorCorpusHash || state.corpusContentHash || null,
      forceHeuristic: Boolean(prepared.frOpts.forceHeuristic),
      skipLlm: Boolean(prepared.frOpts.skipLlm),
      reuseContextPackage: prepared.frOpts.reuseContextPackage || null,
      snapshotId: prepared.frOpts.snapshotId || state.snapshotId,
      generateJsonFn: state.generateJsonFn || prepared.frOpts.generateJsonFn || null,
      env,
      proposedByIdEntries: proposedEntries,
      frFromCrMeta: prepared.frFromCrMeta,
    };
  });

  // Pattern B: nested compiled FR graph (prefix→semantic→conflict→evidence→synthesis)
  graph.addNode('frPipeline', frInner);

  graph.addNode('acceptFr', async (state) => {
    let frSem;
    if (state.frSkipPipeline && state.frFailClosed) {
      frSem = state.frFailClosed;
    } else {
      const proposedById = new Map(
        Array.isArray(state.proposedByIdEntries) ? state.proposedByIdEntries : []
      );
      const g4Out = {
        frUnderstanding: state.frUnderstanding,
        projected: state.projected,
        validation: state.validation,
        selection: state.selection,
        contextPackage: state.contextPackage,
        corpusContentHash: state.corpusContentHash,
        blocked: state.blocked,
        errorCode: state.errorCode,
      };
      frSem = await finalizeFrSemanticFromPipeline(
        g4Out,
        {
          pack: state.pack || {},
          env: state.env || process.env,
          runId: state.runId || null,
          generateJsonFn: state.generateJsonFn || null,
        },
        { proposedById, frFromCrMeta: state.frFromCrMeta }
      );
      frSem = {
        ...frSem,
        status: frSem.status || 'run',
        paused: Boolean(frSem.paused),
        blocked: Boolean(frSem.blocked || state.blocked),
      };
    }

    const applied = applyFrToolToState(state, frSem);
    const containerBase =
      state.container && typeof state.container === 'object' ? state.container : {};
    let containerPatch = null;
    if (applied.srsProposal) {
      containerPatch = sparseContainerPatch(containerBase, {
        analyses: {
          ...(containerBase.analyses || {}),
          srsProposal: applied.srsProposal,
        },
      });
    }

    return {
      ...applied,
      containerPatch,
    };
  });

  graph.addNode('applyShared', async (state) => {
    const update = {
      toolResults: [{ toolName: WHAT_FR_TOOL, ok: true, engineId: 'fr' }],
      history: [`execute:${WHAT_FR_TOOL}`],
      messages: [
        {
          role: 'tool',
          name: WHAT_FR_TOOL,
          content: JSON.stringify({ ok: true, path: 'frUnderstanding_subgraph' }),
        },
      ],
      currentToolName: WHAT_FR_TOOL,
    };
    if (state.containerPatch && typeof state.containerPatch === 'object') {
      update.container = state.containerPatch;
    }
    return update;
  });

  graph.addEdge(START, 'prepareFr');
  graph.addConditionalEdges(
    'prepareFr',
    (state) => (state.frSkipPipeline ? 'acceptFr' : 'frPipeline'),
    { acceptFr: 'acceptFr', frPipeline: 'frPipeline' }
  );
  graph.addEdge('frPipeline', 'acceptFr');
  graph.addEdge('acceptFr', 'applyShared');
  graph.addEdge('applyShared', END);

  const compiled = graph.compile();
  if (!hooks.onProgress && !hooks.bypassCache) {
    _whatFrCache.set(cacheKey, compiled);
  }
  return compiled;
}

const _whatSectionCache = new Map();

function buildWhatSectionToolSubgraph(engineId) {
  const cacheKey = String(engineId || '');
  if (_whatSectionCache.has(cacheKey)) return _whatSectionCache.get(cacheKey);

  const {
    prepareSectionDerive,
    proposeSectionJson,
    acceptSectionDerive,
  } = require('../semantic/runRawSectionDerive');
  const { SECTION_LABEL } = require('../semantic/sectionDeriveRegistry');
  const toolName = `What${SECTION_LABEL[engineId] || String(engineId).toUpperCase()}Tool`;

  const State = Annotation.Root({
    ...buildSecSharedAnnotations(),
    frUnderstanding: field(),
    frOpts: field(),
    srsProposal: field(),
    proposalFragment: field(),
    prepared: field(),
    proposed: field(),
    result: field(),
    containerPatch: field(),
    engineId: field(),
    engineResultsById: field(),
    semanticStatuses: field(),
  });

  const graph = new StateGraph(State);
  graph.addNode('fact', async (state) => {
    const eid = state.engineId || engineId;
    const prepared = prepareSectionDerive({
      engineId: eid,
      pack: state.pack || {},
      env: state.env || process.env,
      proposal: state.srsProposal || null,
      snapshot: state.snapshot || null,
      frUnderstanding: state.frUnderstanding || null,
      evidence: state.frUnderstanding?.evidence || null,
      contextPackage: state.contextPackage || null,
      locale: state.frOpts?.locale || state.pack?.aiAnalysis?.deriveLocale || null,
    });
    return { prepared, engineId: eid };
  });
  graph.addNode('propose', async (state) => {
    const prepared = state.prepared || {};
    if (prepared.mode !== 'llm') return { proposed: null };
    return {
      proposed: await proposeSectionJson(prepared.bundle, null),
    };
  });
  graph.addNode('accept', async (state) => {
    const prepared = state.prepared || {};
    let result;
    if (prepared.mode === 'result') result = prepared.result;
    else result = acceptSectionDerive(prepared.bundle, state.proposed);

    const containerBase =
      state.container && typeof state.container === 'object' ? state.container : {};
    const { applySectionToolToState } = require('./whatPhaseToolNodes');
    const applied = applySectionToolToState(
      { ...state, srsProposal: state.srsProposal },
      state.engineId || engineId,
      result
    );
    let containerPatch = null;
    if (applied.srsProposal) {
      containerPatch = {
        analyses: {
          ...(containerBase.analyses || {}),
          srsProposal: applied.srsProposal,
        },
      };
    }
    return {
      result,
      containerPatch,
      srsProposal: applied.srsProposal,
      proposalFragment: applied.proposalFragment,
      engineResultsById: applied.engineResultsById,
      semanticStatuses: applied.semanticStatuses,
    };
  });
  graph.addNode('applyShared', makeApplySharedNode(toolName));
  graph.addEdge(START, 'fact');
  graph.addEdge('fact', 'propose');
  graph.addEdge('propose', 'accept');
  graph.addEdge('accept', 'applyShared');
  graph.addEdge('applyShared', END);

  const compiled = graph.compile();
  _whatSectionCache.set(cacheKey, compiled);
  return compiled;
}

function listSecSharedKeys() {
  return [...SEC_SHARED_KEYS];
}

module.exports = {
  HOW_SEC_TOOL_NAMES,
  buildSecSharedAnnotations,
  makeApplySharedNode,
  isHowSecResultIncomplete,
  buildArchitectureToolSubgraph,
  getHowSecToolSubgraph,
  buildWhatSectionToolSubgraph,
  buildWhatFrToolSubgraph,
  listSecSharedKeys,
  buildSecToolSubgraphFromInner,
};
