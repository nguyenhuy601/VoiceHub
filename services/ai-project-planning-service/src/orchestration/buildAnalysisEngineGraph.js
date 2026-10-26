/**
 * Shared helpers for analysis-engine packing (rows from pack by engine id).
 * Sync runAnalysisEnginePipeline removed — WHAT uses phase graph + Pattern B.
 */

const {
  ANALYSIS_ENGINE_REGISTRY,
  topologicalLayers,
  getRegistryEntry,
} = require('../srsProposal/contracts/analysisEngineRegistry');

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
    case 'uc':
      return pack.useCases || [];
    case 'data':
      return pack.entities || pack.domainEntities || [];
    case 'fr':
      return pack.functionalRequirements || [];
    default:
      return [];
  }
}

function listEngineNodeIds() {
  return ANALYSIS_ENGINE_REGISTRY.map((e) => e.id);
}

module.exports = {
  listEngineNodeIds,
  topologicalLayers,
  getRegistryEntry,
  packRowsForEngine,
};
