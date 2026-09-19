/**
 * Requirement Analysis tools — registry bootstrap + public API.
 */

const { createToolRegistry } = require('./toolRegistry');
const { createFactStore } = require('./factStore');
const { projectCanonicalBundle } = require('./projectCanonicalBundle');
const { runRecipeWave, runOnDemandTool } = require('./recipe/runRecipeWave');

const { descriptor: traceabilityDescriptor } = require('./recipe/traceabilityGraph');
const { descriptor: coverageDescriptor } = require('./recipe/requirementCoverage');
const { descriptor: completenessDescriptor } = require('./recipe/requirementCompleteness');
const { descriptor: consistencyDescriptor } = require('./recipe/requirementConsistency');
const { descriptor: complexityDescriptor } = require('./recipe/requirementComplexity');
const { descriptor: gateADescriptor } = require('./validation/gateA');

const { descriptor: similarityDescriptor } = require('./onDemand/similarityDuplicate');
const { descriptor: ambiguityDescriptor } = require('./onDemand/ambiguityDetection');
const { descriptor: gapDescriptor } = require('./onDemand/gapDetection');
const { descriptor: classificationDescriptor } = require('./onDemand/requirementClassification');
const { descriptor: nfrFeasibilityDescriptor } = require('./onDemand/nfrFeasibility');
const { descriptor: planningRelevanceDescriptor } = require('./onDemand/planningRelevance');
const { descriptor: scopeAnalysisDescriptor } = require('./scope/scopeAnalysis');
const { descriptor: scopeChangeImpactDescriptor } = require('./scope/scopeChangeImpact');
const { descriptor: constraintValidationDescriptor } = require('./validation/constraintValidation');

function createRequirementToolsRegistry() {
  const registry = createToolRegistry();
  const descriptors = [
    traceabilityDescriptor,
    coverageDescriptor,
    completenessDescriptor,
    consistencyDescriptor,
    complexityDescriptor,
    gateADescriptor,
    similarityDescriptor,
    ambiguityDescriptor,
    gapDescriptor,
    classificationDescriptor,
    nfrFeasibilityDescriptor,
    planningRelevanceDescriptor,
    scopeAnalysisDescriptor,
    scopeChangeImpactDescriptor,
    constraintValidationDescriptor,
  ];
  for (const d of descriptors) {
    registry.register(d);
  }
  return registry;
}

/** Singleton default registry */
let defaultRegistry = null;

function getDefaultRegistry() {
  if (!defaultRegistry) defaultRegistry = createRequirementToolsRegistry();
  return defaultRegistry;
}

/**
 * Build additive analyses.requirementTools payload from pack/snapshot.
 */
function buildRequirementToolsAnalysis({ pack, snapshot, aiAnalysis, thresholds } = {}) {
  const bundle = projectCanonicalBundle({ pack, snapshot, aiAnalysis });
  const registry = getDefaultRegistry();
  const wave = runRecipeWave(registry, bundle, { runGateA: true, thresholds });

  return {
    status: 'ready',
    model: 'deterministic-tools',
    generatedAt: null,
    recipe: wave.recipe,
    gateA: wave.gateA,
    facts: wave.facts,
    meta: {
      ...wave.meta,
      inputHashes: wave.inputHashes,
      schema: 'requirementTools.v1',
    },
  };
}

/**
 * Soft-run recipe for snapshot/pack wire — never throws to caller.
 */
function tryBuildRequirementToolsAnalysis(args) {
  try {
    return { ok: true, analysis: buildRequirementToolsAnalysis(args) };
  } catch (err) {
    return {
      ok: false,
      analysis: {
        status: 'error',
        model: 'deterministic-tools',
        generatedAt: null,
        recipe: null,
        gateA: null,
        facts: {},
        meta: {
          schema: 'requirementTools.v1',
          error: err.message || 'requirement tools failed',
          errorCode: err.code || 'REQUIREMENT_TOOLS_FAILED',
        },
      },
    };
  }
}

function isRequirementToolsRecipeEnabled() {
  const raw = String(process.env.REQUIREMENT_TOOLS_RECIPE || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

module.exports = {
  createToolRegistry,
  createRequirementToolsRegistry,
  getDefaultRegistry,
  createFactStore,
  projectCanonicalBundle,
  runRecipeWave,
  runOnDemandTool,
  buildRequirementToolsAnalysis,
  tryBuildRequirementToolsAnalysis,
  isRequirementToolsRecipeEnabled,
  normalizeToolInput: require('./normalizeToolInput').normalizeToolInput,
  normalizeToolDescriptor: require('./toolDescriptor').normalizeToolDescriptor,
  buildRequirementAiContext: require('./buildRequirementAiContext').buildRequirementAiContext,
  formatVerifiedFactsBlock: require('./buildRequirementAiContext').formatVerifiedFactsBlock,
  ensureRequirementEvidence: require('./ensureRequirementEvidence').ensureRequirementEvidence,
  assertRequirementGate1Approve: require('./assertRequirementGate1Approve')
    .assertRequirementGate1Approve,
  buildHeuristicRequirementInsights: require('./requirementInsightsSchema')
    .buildHeuristicRequirementInsights,
  runRequirementReasoning: require('./runRequirementReasoning').runRequirementReasoning,
  buildProposedSrsDraft: require('./buildProposedSrsDraft').buildProposedSrsDraft,
  runPreApprovalValidation: require('./runPreApprovalValidation').runPreApprovalValidation,
};
