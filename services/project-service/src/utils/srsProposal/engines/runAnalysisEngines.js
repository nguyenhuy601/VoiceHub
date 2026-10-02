/**
 * DAG orchestrator for Analysis engines.
 * Registry = catalog + deps; execution = topological layers (parallel within layer).
 * Does NOT run Meta Gate. Does NOT write srsDraft.
 */

const {
  ANALYSIS_ENGINE_REGISTRY,
  topologicalLayers,
  getRegistryEntry,
} = require('../contracts/analysisEngineRegistry');
const { applyProposalFragment } = require('../srsProposalReducer');
const { createEmptySrsProposal, isSrsProposal } = require('../srsProposalSchema');
const { buildFoundationUnderstanding, applyFoundationToProposal } = require('../foundation');
const { assertNoSrsDraftInEngineResult } = require('../contracts/analysisEngineContract');

const ENGINE_MODULES = {
  bg: () => require('./bgEngine'),
  br: () => require('./brEngine'),
  nfr: () => require('./nfrEngine'),
  scope: () => require('./scopeEngine'),
  bpm: () => require('./bpmEngine'),
  interface: () => require('./interfaceEngine'),
  fr: () => require('./frEngine'),
  uc: () => require('./ucEngine'),
  data: () => require('./dataEngine'),
  glossary: () => require('./glossaryEngine'),
  assumption: () => require('./assumptionEngine'),
  traceability: () => require('./traceabilityEngine'),
};

function loadEngine(id) {
  const loader = ENGINE_MODULES[id];
  if (!loader) {
    const err = new Error(`Unknown engine: ${id}`);
    err.code = 'UNKNOWN_ENGINE';
    throw err;
  }
  return loader();
}

/**
 * When FR engine is skipped (already on proposal), seed resultsById.fr so
 * assumption can lift CQ and UC/data can read dependencyResults.fr.
 * @param {object} resultsById
 * @param {object} proposal
 * @param {Set<string>} skip
 */
function injectSkippedFrUpstream(resultsById, proposal, skip) {
  if (!skip?.has?.('fr') || resultsById.fr) return;
  const frBlock = proposal?.generated?.functionalRequirements;
  const items = Array.isArray(frBlock?.items) ? frBlock.items : [];
  if (!items.length) return;
  resultsById.fr = {
    execution: { status: 'SUCCESS', diagnostics: [] },
    items,
    relations: Array.isArray(frBlock?.relations) ? frBlock.relations : [],
    clarificationQuestions: Array.isArray(frBlock?.clarificationQuestions)
      ? frBlock.clarificationQuestions
      : [],
    coverage: frBlock?.meta?.coverage || { status: 'AVAILABLE' },
    validation: frBlock?.meta?.validation || { errors: [], warnings: [] },
    meta: {
      engineId: 'fr',
      section: 'functionalRequirements',
      version: 1,
      syntheticFromProposal: true,
    },
  };
}

function buildProjections(opts = {}) {
  const pack = opts.pack || {};
  const projections = opts.projections || {};
  return {
    bg: projections.bg || { rows: pack.businessGoals || pack.goals },
    br: projections.br || { rows: pack.businessRules },
    nfr: projections.nfr || { rows: pack.nonFunctionalRequirements || pack.nfrs },
    scope: projections.scope || { rows: pack.scope || pack.scopeItems },
    bpm: projections.bpm || { rows: pack.businessProcesses || pack.processes },
    interface: projections.interface || { rows: pack.interfaces },
    fr:
      projections.fr ||
      (opts.proposalFragment
        ? { proposalFragment: opts.proposalFragment }
        : { items: pack.functionalRequirements || opts.existingFrItems || [] }),
    uc: projections.uc || { rows: pack.useCases },
    data: projections.data || { rows: pack.entities || pack.domainEntities },
    glossary: projections.glossary || { rows: pack.glossary || pack.glossaryTerms },
    assumption: projections.assumption || { rows: pack.assumptions },
    traceability: projections.traceability || {
      rawRows: opts.rawRows || pack.rawRows || [],
    },
  };
}

/**
 * @param {{
 *   proposal?: object,
 *   pack?: object,
 *   snapshot?: object,
 *   rawRecord?: object,
 *   projections?: object,
 *   proposalFragment?: object,
 *   existingFrItems?: object[],
 *   skipEngineIds?: string[],
 *   parallel?: boolean,
 * }} opts
 */
async function runAnalysisEngines(opts = {}) {
  let proposal = isSrsProposal(opts.proposal)
    ? opts.proposal
    : createEmptySrsProposal({ source: 'analysis_engines' });

  const foundation = buildFoundationUnderstanding({
    rawRecord: opts.rawRecord,
    snapshot: opts.snapshot,
  });
  proposal = applyFoundationToProposal(proposal, foundation);

  const projections = buildProjections(opts);
  const skip = new Set(opts.skipEngineIds || []);
  // When FR already applied via whatG4Policy, skip re-running fr unless forced
  if (opts.skipFrIfPresent !== false) {
    const frCount = proposal.generated?.functionalRequirements?.items?.length || 0;
    if (frCount > 0 && !opts.forceFr) skip.add('fr');
  }

  const layers = topologicalLayers();
  const resultsById = {};
  const executionOrder = [];
  injectSkippedFrUpstream(resultsById, proposal, skip);

  for (const layer of layers) {
    const runnable = layer.filter((id) => !skip.has(id));
    const runOne = async (id) => {
      const entry = getRegistryEntry(id);
      const engine = loadEngine(id);
      const upstreamFragments = {};
      const dependencyResults = { ...resultsById };
      // Expose FR items for derived engines
      if (resultsById.fr) {
        upstreamFragments.functionalRequirements = {
          items: resultsById.fr.items || [],
        };
      } else if (proposal.generated?.functionalRequirements?.items?.length) {
        upstreamFragments.functionalRequirements = {
          items: proposal.generated.functionalRequirements.items,
        };
      }

      const engineInput = {
        ownedSectionProjection: projections[id] || {},
        upstreamFragments,
        context: {
          pack: opts.pack || {},
          snapshot: opts.snapshot || null,
          rawRecord: opts.rawRecord || null,
          dependencyResults,
          analysisRunId: opts.analysisRunId || null,
        },
        proposalFragment: opts.proposalFragment,
        pack: opts.pack,
      };

      const result = await Promise.resolve(engine.run(engineInput));
      assertNoSrsDraftInEngineResult(result);
      return { id, entry, result };
    };

    const layerOut =
      opts.parallel === false
        ? await runnable.reduce(async (prev, id) => {
            const acc = await prev;
            acc.push(await runOne(id));
            return acc;
          }, Promise.resolve([]))
        : await Promise.all(runnable.map(runOne));

    for (const { id, entry, result } of layerOut) {
      resultsById[id] = result;
      executionOrder.push(id);
      if (result.execution?.status === 'SUCCESS' && entry?.writesSection) {
        proposal = applyProposalFragment(
          proposal,
          {
            section: entry.writesSection,
            items: result.items || [],
            relations: result.relations || [],
            clarificationQuestions: result.clarificationQuestions || [],
            meta: {
              engineId: id,
              coverage: result.coverage,
              validation: result.validation,
              kind: 'analysis_engine',
            },
          },
          { bumpProposalVersion: false }
        );
      }
    }
  }

  // Boundary: never attach srsDraft
  if (proposal.analyses?.srsDraft) delete proposal.analyses.srsDraft;

  return {
    proposal,
    resultsById,
    executionOrder,
    layers,
    registrySize: ANALYSIS_ENGINE_REGISTRY.length,
  };
}

module.exports = {
  runAnalysisEngines,
  buildProjections,
  loadEngine,
  injectSkippedFrUpstream,
  ENGINE_MODULES,
};
