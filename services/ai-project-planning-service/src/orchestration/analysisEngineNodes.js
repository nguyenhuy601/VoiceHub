/**
 * Analysis Engine LangGraph nodes — 1 engine = 1 node (+ metaGate).
 * Layer order from analysisEngineRegistry.topologicalLayers().
 */

const {
  ANALYSIS_ENGINE_REGISTRY,
  topologicalLayers,
  getRegistryEntry,
} = require('../srsProposal/contracts/analysisEngineRegistry');
const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { createEmptySrsProposal, isSrsProposal } = require('../srsProposal/srsProposalSchema');
const { buildFoundationUnderstanding, applyFoundationToProposal } = require('../srsProposal/foundation');
const { assertNoSrsDraftInEngineResult } = require('../srsProposal/contracts/analysisEngineContract');
const { buildProjections, loadEngine, injectSkippedFrUpstream } = require('../srsProposal/engines/runAnalysisEngines');
const { runMetaGate } = require('../srsProposal/metaGate');
const { runSemanticTask } = require('../semantic/runSemanticTask');
const { resolveTaskPolicy, TASK_POLICIES } = require('../semantic/semanticTaskRegistry');
const { packRowsForEngine } = require('./buildAnalysisEngineGraph');
const { applyRawSectionDerive } = require('../semantic/applyRawSectionDerive');
const {
  isCustomerRawIntakePack,
  shouldRawDeriveSection,
  isLlmDeriveSection,
} = require('../semantic/rawSectionDerivePolicy');
const { shouldApplyEngineSectionWrite } = require('../srsProposal/preserveDerivedSections');

const ENGINE_NODE_IDS = ANALYSIS_ENGINE_REGISTRY.map((e) => e.id);
/** PRODUCE candidates (LLM derive) — must run before metaGate; never inside metaGate. */
const DERIVE_NODE_ID = 'deriveRawSections';
/** CHECK readiness only — RULE-META-01: no LLM / no derive. */
const META_GATE_NODE_ID = 'metaGate';

function engineGraphNodeName(engineId) {
  return `engine_${engineId}`;
}

function listAnalysisGraphNodeIds() {
  return [
    ...ENGINE_NODE_IDS.map(engineGraphNodeName),
    DERIVE_NODE_ID,
    META_GATE_NODE_ID,
  ];
}

function flattenLayerOrder() {
  return topologicalLayers().flat();
}

function ensureProposal(state) {
  if (isSrsProposal(state.srsProposal)) return state.srsProposal;
  let proposal = createEmptySrsProposal({ source: 'analysis_engine_graph' });
  if (state.proposalFragment?.section === 'functionalRequirements') {
    proposal = applyProposalFragment(proposal, state.proposalFragment, {
      bumpProposalVersion: true,
      generationId: state.proposalFragment?.meta?.generationId || state.runId,
    });
  }
  const foundation = buildFoundationUnderstanding({
    rawRecord: state.pack?.aiAnalysis?.analyses?.customerRawRecord || null,
    snapshot: state.snapshot || null,
  });
  return applyFoundationToProposal(proposal, foundation);
}

function stripHeuristicIfEmptySheet(proposal, engineId, pack, env) {
  if (engineId === 'uc' && String(env.PHASE1_UC_HEURISTIC_FROM_FR || '0') !== '1') {
    const items = proposal.generated?.useCases?.items || [];
    const allHeuristic =
      items.length > 0 &&
      items.every((it) => String(it?.provenance?.type || it?.origin?.type).toUpperCase() === 'HEURISTIC');
    if (allHeuristic && !(pack.useCases || []).length) {
      return applyProposalFragment(
        proposal,
        {
          section: 'useCases',
          items: [],
          meta: {
            engineId: 'uc',
            coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
            validation: { errors: [], warnings: [] },
          },
        },
        { bumpProposalVersion: false }
      );
    }
  }
  if (engineId === 'data' && String(env.PHASE1_DATA_HEURISTIC_FROM_FR || '0') !== '1') {
    const items = proposal.generated?.entities?.items || [];
    const allHeuristic =
      items.length > 0 &&
      items.every((it) => String(it?.provenance?.type || it?.origin?.type).toUpperCase() === 'HEURISTIC');
    if (allHeuristic && !(pack.entities || pack.domainEntities || []).length) {
      return applyProposalFragment(
        proposal,
        {
          section: 'entities',
          items: [],
          meta: {
            engineId: 'data',
            coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
            validation: { errors: [], warnings: [] },
          },
        },
        { bumpProposalVersion: false }
      );
    }
  }
  return proposal;
}

/**
 * Run a single analysis engine node (deterministic ingest + optional semantic enrich).
 */
async function runOneEngineNode(engineId, state, env = process.env) {
  let proposal = ensureProposal(state);
  const resultsById = { ...(state.engineResultsById || {}) };
  const pack = state.pack || {};
  const projections = buildProjections({
    pack,
    snapshot: state.snapshot || null,
    rawRecord: pack?.aiAnalysis?.analyses?.customerRawRecord || null,
    proposalFragment: state.proposalFragment || null,
  });

  const skip = new Set();
  if (engineId === 'fr') {
    const frCount = proposal.generated?.functionalRequirements?.items?.length || 0;
    if (frCount > 0) skip.add('fr');
  }
  injectSkippedFrUpstream(resultsById, proposal, skip);

  if (skip.has(engineId)) {
    return {
      srsProposal: proposal,
      engineResultsById: resultsById,
      history: [...(state.history || []), engineGraphNodeName(engineId) + ':skip'],
      semanticStatuses: { ...(state.semanticStatuses || {}), [engineId]: 'skip_present' },
    };
  }

  const entry = getRegistryEntry(engineId);
  const engine = loadEngine(engineId);
  const upstreamFragments = {};
  if (resultsById.fr) {
    upstreamFragments.functionalRequirements = { items: resultsById.fr.items || [] };
  } else if (proposal.generated?.functionalRequirements?.items?.length) {
    upstreamFragments.functionalRequirements = {
      items: proposal.generated.functionalRequirements.items,
    };
  }

  const result = engine.run({
    ownedSectionProjection: projections[engineId] || {},
    upstreamFragments,
    context: {
      pack,
      snapshot: state.snapshot || null,
      rawRecord: pack?.aiAnalysis?.analyses?.customerRawRecord || null,
      dependencyResults: { ...resultsById },
      analysisRunId: state.runId || null,
    },
    proposalFragment: state.proposalFragment,
    pack,
  });
  assertNoSrsDraftInEngineResult(result);
  resultsById[engineId] = result;

  if (
    result.execution?.status === 'SUCCESS' &&
    entry?.writesSection &&
    shouldApplyEngineSectionWrite(proposal, entry.writesSection, result.items)
  ) {
    proposal = applyProposalFragment(
      proposal,
      {
        section: entry.writesSection,
        items: result.items || [],
        relations: result.relations || [],
        clarificationQuestions: result.clarificationQuestions || [],
        meta: {
          engineId,
          coverage: result.coverage,
          validation: result.validation,
          kind: 'analysis_engine',
        },
      },
      { bumpProposalVersion: false }
    );
  }

  proposal = stripHeuristicIfEmptySheet(proposal, engineId, pack, env);

  const packRows = packRowsForEngine(engineId, pack);
  const rawPending =
    isCustomerRawIntakePack(pack) &&
    !packRows.length &&
    shouldRawDeriveSection(engineId, pack, env);

  let semanticStatus = rawPending
    ? 'raw_derive_pending'
    : resolveTaskPolicy(engineId, {
        sourceEmpty: !packRows.length,
        env,
      });
  // PERF: sheet/pack already populated section — do not re-LLM (was ~130s on NFR×10).
  const sectionItems = entry?.writesSection
    ? proposal.generated?.[entry.writesSection]?.items || []
    : [];
  const sheetAlreadyPresent = Array.isArray(sectionItems) && sectionItems.length > 0;
  if (sheetAlreadyPresent && semanticStatus === TASK_POLICIES.RUN) {
    semanticStatus = 'skip_sheet_present';
  }
  // Customer Raw LLM sections: only deriveRawSections (not parallel runSemanticTask).
  const skipLegacySemantic =
    isCustomerRawIntakePack(pack) && isLlmDeriveSection(engineId);
  if (
    !rawPending &&
    !sheetAlreadyPresent &&
    !skipLegacySemantic &&
    engineId !== 'fr' &&
    engineId !== 'glossary' &&
    engineId !== 'assumption' &&
    engineId !== 'traceability' &&
    semanticStatus === TASK_POLICIES.RUN
  ) {
    const rows = packRows;
    if (rows.length) {
      const sem = await runSemanticTask({ taskId: engineId, rows, pack, env });
      semanticStatus = sem.status;
      if (sem.status === TASK_POLICIES.RUN && sem.items?.length && entry?.writesSection) {
        proposal = applyProposalFragment(
          proposal,
          {
            section: entry.writesSection,
            items: sem.items,
            meta: {
              engineId,
              coverage: sem.coverage,
              validation: { errors: [], warnings: [] },
              kind: 'semantic_runtime',
            },
          },
          { bumpProposalVersion: false }
        );
        resultsById[engineId] = {
          execution: { status: 'SUCCESS', diagnostics: [] },
          items: sem.items,
          coverage: sem.coverage,
          validation: { errors: [], warnings: [] },
          meta: { engineId, section: entry.writesSection },
        };
      }
    }
  }

  return {
    srsProposal: proposal,
    engineResultsById: resultsById,
    history: [...(state.history || []), engineGraphNodeName(engineId)],
    semanticStatuses: { ...(state.semanticStatuses || {}), [engineId]: semanticStatus },
  };
}

/**
 * Derive / Proposal Generation — PRODUCE only (Customer Raw → UC/BG candidates).
 * RULE: do not fold this into metaGate.
 */
async function runDeriveRawSectionsNode(state) {
  const { markStage, startSpan } = require('./whatTiming');
  let whatTiming = state.whatTiming || null;
  let proposal = ensureProposal(state);
  let resultsById = { ...(state.engineResultsById || {}) };
  const pack = state.pack || {};
  const env = state.env || process.env;
  const endDerive = startSpan();
  const derived = await applyRawSectionDerive({
    proposal,
    pack,
    resultsById,
    env,
    g4Understanding: state.g4Understanding || null,
    evidence: state.g4Understanding?.evidence || null,
    snapshot: state.snapshot || null,
  });
  const wallMs = endDerive();
  proposal = derived.proposal;
  resultsById = { ...resultsById, ...(derived.resultsById || {}) };
  const bgMeta = derived.timingMeta?.bg_derive || {};
  if (whatTiming) {
    whatTiming = markStage(whatTiming, 'bg_derive', {
      ms: wallMs,
      wallMs,
      evalCount: bgMeta.evalCount || 0,
      promptEvalCount: bgMeta.promptEvalCount || 0,
      promptChars: bgMeta.promptChars || 0,
      maxTokens: bgMeta.maxTokens ?? null,
      reason: bgMeta.reason || null,
      items: bgMeta.items || 0,
      llmCalls: bgMeta.llmCalls || 0,
      bySection: bgMeta.bySection || null,
    });
  }
  return {
    srsProposal: proposal,
    engineResultsById: resultsById,
    semanticStatuses: {
      ...(state.semanticStatuses || {}),
      ...(derived.deriveStatuses || {}),
    },
    history: [...(state.history || []), DERIVE_NODE_ID],
    whatTiming,
  };
}

/**
 * Meta Gate — CHECK only (sectionReviews / Gate1 readiness).
 * RULE-META-01: no LLM, no applyRawSectionDerive, no domain candidate production.
 */
async function runMetaGateNode(state) {
  const { markStage, startSpan } = require('./whatTiming');
  let whatTiming = state.whatTiming || null;
  const endMeta = startSpan();
  let proposal = ensureProposal(state);
  const resultsById = { ...(state.engineResultsById || {}) };
  proposal = runMetaGate(proposal, { resultsById });
  if (state.runId) proposal.generationId = String(state.runId);

  const container =
    state.container && typeof state.container === 'object'
      ? { ...state.container }
      : { analyses: {}, phaseRuns: {} };
  container.analyses = { ...(container.analyses || {}), srsProposal: proposal };
  container.phaseRuns = {
    ...(container.phaseRuns || {}),
    phase_what: {
      ...(container.phaseRuns?.phase_what || {}),
      readyForGate1: Boolean(proposal.completeness?.readyForGate1),
      gateDecision: proposal.completeness?.gateDecision || proposal.meta?.gateDecision || null,
      analysisEngineGraph: true,
    },
  };

  if (whatTiming) {
    whatTiming = markStage(whatTiming, 'meta', { ms: endMeta() });
  }

  return {
    srsProposal: proposal,
    engineResultsById: resultsById,
    container,
    history: [...(state.history || []), META_GATE_NODE_ID],
    whatTiming,
  };
}

/**
 * Attach engine_* + deriveRawSections + metaGate; return edge helpers.
 * @param {import('@langchain/langgraph').StateGraph} graph
 * @param {{ onProgress?: Function }} [hooks]
 */
function attachAnalysisEngineNodes(graph, hooks = {}) {
  const onProgress = hooks.onProgress || null;

  for (const engineId of ENGINE_NODE_IDS) {
    const nodeName = engineGraphNodeName(engineId);
    graph.addNode(nodeName, async (state) => {
      if (state.stopReason || state.paused) return {};
      const { markStage, startSpan } = require('./whatTiming');
      onProgress?.({ node: nodeName, phase: 'what', engineId });
      const endEng = startSpan();
      const out = await runOneEngineNode(engineId, state, process.env);
      let whatTiming = state.whatTiming || out.whatTiming || null;
      if (whatTiming) {
        const prevMs = Number(whatTiming.stages?.engines?.ms) || 0;
        whatTiming = markStage(whatTiming, 'engines', {
          ms: prevMs + endEng(),
        });
      }
      return { ...out, whatTiming };
    });
  }

  graph.addNode(DERIVE_NODE_ID, async (state) => {
    if (state.stopReason || state.paused) return {};
    onProgress?.({
      node: DERIVE_NODE_ID,
      phase: 'what',
      step: 4,
      substep: 'derive',
    });
    return runDeriveRawSectionsNode(state);
  });

  graph.addNode(META_GATE_NODE_ID, async (state) => {
    if (state.stopReason || state.paused) return {};
    onProgress?.({
      node: META_GATE_NODE_ID,
      phase: 'what',
      step: 4,
      substep: 'meta_gate',
    });
    return runMetaGateNode(state);
  });

  return {
    firstNode: engineGraphNodeName(flattenLayerOrder()[0]),
    lastEngineNode: engineGraphNodeName(flattenLayerOrder()[flattenLayerOrder().length - 1]),
    deriveNode: DERIVE_NODE_ID,
    metaGateNode: META_GATE_NODE_ID,
    orderedEngineNodes: flattenLayerOrder().map(engineGraphNodeName),
  };
}

/**
 * Wire Step 2+: entry → deriveRawSections → engine_* → evaluateNode → metaGate → exit
 * @param {object} graph
 * @param {{ entryNode: string, evaluateNode: string, exitNode: string }} opts
 */
function wireAnalysisEngineEdges(graph, { entryNode, evaluateNode, exitNode }) {
  const order = flattenLayerOrder().map(engineGraphNodeName);
  const afterDerive = order.length ? order[0] : evaluateNode;
  graph.addEdge(entryNode, DERIVE_NODE_ID);
  graph.addEdge(DERIVE_NODE_ID, afterDerive);
  if (order.length) {
    for (let i = 0; i < order.length - 1; i += 1) {
      graph.addEdge(order[i], order[i + 1]);
    }
    graph.addEdge(order[order.length - 1], evaluateNode);
  }
  graph.addEdge(evaluateNode, META_GATE_NODE_ID);
  graph.addEdge(META_GATE_NODE_ID, exitNode);
}

module.exports = {
  ENGINE_NODE_IDS,
  DERIVE_NODE_ID,
  META_GATE_NODE_ID,
  engineGraphNodeName,
  listAnalysisGraphNodeIds,
  flattenLayerOrder,
  runOneEngineNode,
  runDeriveRawSectionsNode,
  runMetaGateNode,
  attachAnalysisEngineNodes,
  wireAnalysisEngineEdges,
};
