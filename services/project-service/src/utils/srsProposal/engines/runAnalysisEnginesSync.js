/**
 * Synchronous DAG orchestrator (engines are sync in V1).
 * Same contract as runAnalysisEngines — Meta Gate not included.
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
const { buildProjections, loadEngine, injectSkippedFrUpstream } = require('./runAnalysisEngines');

/**
 * @param {object} opts — same as runAnalysisEngines
 */
function runAnalysisEnginesSync(opts = {}) {
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
    for (const id of runnable) {
      const entry = getRegistryEntry(id);
      const engine = loadEngine(id);
      const upstreamFragments = {};
      if (resultsById.fr) {
        upstreamFragments.functionalRequirements = { items: resultsById.fr.items || [] };
      } else if (proposal.generated?.functionalRequirements?.items?.length) {
        upstreamFragments.functionalRequirements = {
          items: proposal.generated.functionalRequirements.items,
        };
      }

      const result = engine.run({
        ownedSectionProjection: projections[id] || {},
        upstreamFragments,
        context: {
          pack: opts.pack || {},
          snapshot: opts.snapshot || null,
          rawRecord: opts.rawRecord || null,
          dependencyResults: { ...resultsById },
          analysisRunId: opts.analysisRunId || null,
        },
        proposalFragment: opts.proposalFragment,
        pack: opts.pack,
      });
      assertNoSrsDraftInEngineResult(result);
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

  return {
    proposal,
    resultsById,
    executionOrder,
    layers,
    registrySize: ANALYSIS_ENGINE_REGISTRY.length,
  };
}

module.exports = { runAnalysisEnginesSync };
