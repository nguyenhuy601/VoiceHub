/**
 * Build / run Analysis Engine pipeline on APS (layers from registry).
 * Each engine is conceptually one LangGraph node; sync runner for V1 parity + tests.
 */

const {
  topologicalLayers,
  getRegistryEntry,
  ANALYSIS_ENGINE_REGISTRY,
} = require('../srsProposal/contracts/analysisEngineRegistry');
const { runAnalysisEnginesSync } = require('../srsProposal/engines/runAnalysisEnginesSync');
const { runMetaGate } = require('../srsProposal/metaGate');
const { createEmptySrsProposal, isSrsProposal } = require('../srsProposal/srsProposalSchema');
const { applyProposalFragment } = require('../srsProposal/srsProposalReducer');
const { runSemanticTask } = require('../semantic/runSemanticTask');
const { resolveTaskPolicy, TASK_POLICIES } = require('../semantic/semanticTaskRegistry');
const { applyRawSectionDerive } = require('../semantic/applyRawSectionDerive');
const {
  isCustomerRawIntakePack,
  shouldRawDeriveSection,
  isLlmDeriveSection,
} = require('../semantic/rawSectionDerivePolicy');

function packRowsForEngine(engineId, pack = {}) {
  switch (engineId) {
    case 'bg':
      return pack.businessGoals || pack.goals || [];
    case 'br':
      return pack.businessRules || [];
    case 'nfr':
      return pack.nonFunctionalRequirements || pack.nfrs || [];
    case 'scope':
      return pack.scope || pack.scopeItems || [];
    case 'bpm':
      return pack.businessProcesses || pack.processes || [];
    case 'interface':
      return pack.interfaces || [];
    case 'uc':
      return pack.useCases || [];
    case 'data':
      return pack.entities || pack.domainEntities || [];
    case 'glossary':
      return pack.glossary || pack.glossaryTerms || [];
    case 'assumption':
      return pack.assumptions || [];
    case 'fr':
      return pack.functionalRequirements || [];
    default:
      return [];
  }
}

/**
 * Run full analysis engine DAG + Meta Gate.
 * Optional semantic enrich for non-FR when policy RUN (SEMANTIC_NONFR_RUNTIME=1).
 *
 * @param {{
 *   proposal?: object,
 *   pack?: object,
 *   snapshot?: object,
 *   rawRecord?: object,
 *   proposalFragment?: object,
 *   skipFrIfPresent?: boolean,
 *   env?: NodeJS.ProcessEnv,
 * }} opts
 */
async function runAnalysisEnginePipeline(opts = {}) {
  let proposal = isSrsProposal(opts.proposal)
    ? opts.proposal
    : createEmptySrsProposal({ source: 'analysis_engine_graph' });

  if (opts.proposalFragment?.section === 'functionalRequirements') {
    proposal = applyProposalFragment(proposal, opts.proposalFragment, {
      bumpProposalVersion: true,
      generationId: opts.proposalFragment?.meta?.generationId,
    });
  }

  const pack = opts.pack || {};
  const env = opts.env || process.env;
  const semanticStatuses = {};

  // Step 2+: PRODUCE candidates before Analysis Engines
  await opts.onProgress?.({
    node: 'deriveRawSections',
    phase: 'what',
    step: 4,
    substep: 'derive',
  });
  const derived = await applyRawSectionDerive({
    proposal,
    pack,
    resultsById: {},
    env,
    invokeFn: opts.invokeFn,
    g4Understanding: opts.g4Understanding || null,
    evidence: opts.evidence || opts.g4Understanding?.evidence || null,
    snapshot: opts.snapshot || null,
  });
  proposal = derived.proposal;
  const resultsById = { ...(derived.resultsById || {}) };
  Object.assign(semanticStatuses, derived.deriveStatuses || {});

  const packForEngines = { ...pack };
  const syncOut = runAnalysisEnginesSync({
    proposal,
    pack: packForEngines,
    snapshot: opts.snapshot || null,
    rawRecord: opts.rawRecord || null,
    proposalFragment: opts.proposalFragment || null,
    skipFrIfPresent: opts.skipFrIfPresent !== false,
  });

  proposal = syncOut.proposal;
  Object.assign(resultsById, syncOut.resultsById);

  // Strip heuristic UC/Data when flags off and no sheet source (never strip DERIVED)
  if (String(env.PHASE1_UC_HEURISTIC_FROM_FR || '0') !== '1') {
    const ucItems = proposal.generated?.useCases?.items || [];
    const allHeuristic =
      ucItems.length > 0 &&
      ucItems.every((it) => String(it?.provenance?.type || it?.origin?.type).toUpperCase() === 'HEURISTIC');
    if (allHeuristic && !(pack.useCases || []).length) {
      proposal = applyProposalFragment(
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
      resultsById.uc = {
        execution: { status: 'SUCCESS', diagnostics: [] },
        items: [],
        coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
        validation: { errors: [], warnings: [] },
        meta: { engineId: 'uc', section: 'useCases' },
      };
    }
  }

  if (String(env.PHASE1_DATA_HEURISTIC_FROM_FR || '0') !== '1') {
    const dataItems = proposal.generated?.entities?.items || [];
    const allHeuristic =
      dataItems.length > 0 &&
      dataItems.every((it) => String(it?.provenance?.type || it?.origin?.type).toUpperCase() === 'HEURISTIC');
    if (allHeuristic && !(pack.entities || pack.domainEntities || []).length) {
      proposal = applyProposalFragment(
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
      resultsById.data = {
        execution: { status: 'SUCCESS', diagnostics: [] },
        items: [],
        coverage: { status: 'NO_DATA', reason: 'SOURCE_SHEET_EMPTY' },
        validation: { errors: [], warnings: [] },
        meta: { engineId: 'data', section: 'entities' },
      };
    }
  }

  // Optional Semantic Runtime enrich for non-FR when policy RUN (sheet present)
  for (const entry of ANALYSIS_ENGINE_REGISTRY) {
    if (entry.id === 'fr' || entry.id === 'glossary' || entry.id === 'assumption' || entry.id === 'traceability') {
      continue;
    }
    const rows = packRowsForEngine(entry.id, pack);
    const existingItems = proposal.generated?.[entry.writesSection]?.items || [];
    if (existingItems.length) {
      semanticStatuses[entry.id] = semanticStatuses[entry.id] || 'derived_or_present';
      continue;
    }
    if (isCustomerRawIntakePack(pack) && !rows.length && shouldRawDeriveSection(entry.id, pack, env)) {
      semanticStatuses[entry.id] = 'raw_derive_pending';
      continue;
    }
    // Customer Raw LLM sections: deriveRawSections only (no parallel runSemanticTask).
    if (isCustomerRawIntakePack(pack) && isLlmDeriveSection(entry.id)) {
      semanticStatuses[entry.id] = semanticStatuses[entry.id] || 'derive_path_only';
      continue;
    }
    const policy = resolveTaskPolicy(entry.id, {
      sourceEmpty: !rows.length,
      env,
    });
    semanticStatuses[entry.id] = policy;
    if (policy !== TASK_POLICIES.RUN || !rows.length) continue;

    const sem = await runSemanticTask({ taskId: entry.id, rows, pack, env });
    if (sem.status === TASK_POLICIES.RUN && sem.items?.length) {
      proposal = applyProposalFragment(
        proposal,
        {
          section: entry.writesSection,
          items: sem.items,
          meta: {
            engineId: entry.id,
            coverage: sem.coverage,
            validation: { errors: [], warnings: [] },
            kind: 'semantic_runtime',
          },
        },
        { bumpProposalVersion: false }
      );
      resultsById[entry.id] = {
        execution: { status: 'SUCCESS', diagnostics: [] },
        items: sem.items,
        coverage: sem.coverage,
        validation: { errors: [], warnings: [] },
        meta: { engineId: entry.id, section: entry.writesSection },
      };
    }
  }

  await opts.onProgress?.({
    node: 'evaluateLocal',
    phase: 'what',
    step: 4,
    substep: 'evaluate_local',
  });

  // CHECK only — RULE-META-01: no derive inside metaGate
  await opts.onProgress?.({
    node: 'metaGate',
    phase: 'what',
    step: 4,
    substep: 'meta_gate',
  });
  proposal = runMetaGate(proposal, { resultsById });

  return {
    proposal,
    resultsById,
    executionOrder: syncOut.executionOrder,
    layers: topologicalLayers(),
    registrySize: ANALYSIS_ENGINE_REGISTRY.length,
    semanticStatuses,
    deriveStatuses: derived.deriveStatuses || {},
    gateDecision: proposal.completeness?.gateDecision || proposal.meta?.gateDecision || null,
  };
}

function listEngineNodeIds() {
  return ANALYSIS_ENGINE_REGISTRY.map((e) => e.id);
}

module.exports = {
  runAnalysisEnginePipeline,
  listEngineNodeIds,
  topologicalLayers,
  getRegistryEntry,
  packRowsForEngine,
};
