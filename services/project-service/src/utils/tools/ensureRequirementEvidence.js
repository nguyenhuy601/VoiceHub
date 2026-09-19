/**
 * Ensure on-demand Requirement evidence (A5–A7) when recipe facts are thin.
 * Calls Registry only; no Mongo.
 */

const { createFactStore } = require('./factStore');
const { projectCanonicalBundle } = require('./projectCanonicalBundle');
const { createToolRegistry } = require('./toolRegistry');
const { runOnDemandTool } = require('./recipe/runRecipeWave');
const { buildRequirementAiContext } = require('./buildRequirementAiContext');

const { descriptor: similarityDescriptor } = require('./onDemand/similarityDuplicate');
const { descriptor: ambiguityDescriptor } = require('./onDemand/ambiguityDetection');
const { descriptor: gapDescriptor } = require('./onDemand/gapDetection');
const { descriptor: completenessDescriptor } = require('./recipe/requirementCompleteness');

let evidenceRegistry = null;

function getEvidenceRegistry() {
  if (!evidenceRegistry) {
    evidenceRegistry = createToolRegistry();
    // completeness needed so gap can dependOn completeness.score when run after recipe store seed
    for (const d of [
      completenessDescriptor,
      similarityDescriptor,
      ambiguityDescriptor,
      gapDescriptor,
    ]) {
      evidenceRegistry.register(d);
    }
  }
  return evidenceRegistry;
}

/**
 * @param {{ pack?: object, snapshot?: object, need?: string[], requirementTools?: object }} args
 * @returns {{ extras: object, results: object, requirementAiContext: object }}
 */
function ensureRequirementEvidence({
  pack = {},
  snapshot = null,
  need = [],
  requirementTools = null,
} = {}) {
  const tools =
    requirementTools || pack?.aiAnalysis?.analyses?.requirementTools || null;
  const facts = tools?.facts || {};
  const store = createFactStore();
  if (facts && typeof facts === 'object') {
    store.putFacts(
      Object.entries(facts).map(([key, value]) => ({
        key,
        value,
        source: { tool: 'requirementTools', version: 1 },
        evidence: [],
      }))
    );
  }

  const bundle = projectCanonicalBundle({ pack, snapshot, aiAnalysis: pack.aiAnalysis });
  const registry = getEvidenceRegistry();
  const results = {};
  const extras = {};
  const needs = new Set((need || []).map(String));

  // Default: enrich ambiguity when caller asks or when scope ambiguity missing
  const wantAmbiguity =
    needs.has('ambiguity') ||
    needs.has('A6') ||
    (needs.size === 0 && facts['scope.ambiguousCount'] == null);

  if (wantAmbiguity) {
    try {
      results.ambiguity = runOnDemandTool(
        registry,
        'ambiguity_detection',
        { fr: bundle.fr },
        store
      );
      extras.ambiguityItems = results.ambiguity?.data?.items || [];
    } catch (err) {
      results.ambiguityError = err.message || 'ambiguity_failed';
    }
  }

  if (needs.has('similarity') || needs.has('A5')) {
    try {
      results.similarity = runOnDemandTool(
        registry,
        'requirement_similarity_duplicate',
        { fr: bundle.fr, threshold: 0.85 },
        store
      );
    } catch (err) {
      results.similarityError = err.message || 'similarity_failed';
    }
  }

  if (needs.has('gap') || needs.has('A7')) {
    try {
      if (!store.has('completeness.score')) {
        registry.execute(
          'requirement_completeness',
          { fr: bundle.fr },
          { factStore: store, allowedModes: ['recipe'] }
        );
      }
      const completenessItems = store.get('completeness.items')?.value || [];
      results.gap = runOnDemandTool(
        registry,
        'gap_detection',
        {
          completenessItems,
          uncovered: tools?.recipe?.coverage?.uncovered || [],
        },
        store
      );
    } catch (err) {
      results.gapError = err.message || 'gap_failed';
    }
  }

  const storeObj = store.toObject();
  const mergedTools = {
    ...(tools || {}),
    facts: { ...(tools?.facts || {}), ...storeObj.facts },
    gateA: tools?.gateA || null,
    recipe: tools?.recipe || null,
  };

  if (extras.ambiguityItems?.length) {
    const high = extras.ambiguityItems.filter((i) => Number(i.ambiguity) >= 0.6).length;
    mergedTools.facts = {
      ...mergedTools.facts,
      'ambiguity.highCount': high,
    };
  }

  const requirementAiContext = buildRequirementAiContext({
    pack,
    requirementTools: mergedTools,
    extras,
  });

  return { extras, results, requirementAiContext, requirementTools: mergedTools };
}

module.exports = { ensureRequirementEvidence };
