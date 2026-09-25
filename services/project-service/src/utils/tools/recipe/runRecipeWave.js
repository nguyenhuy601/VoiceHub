/**
 * Recipe wave: A1 ∥ A3 ∥ A4 ∥ T3 then A2, B1 scope, then optional Gate A.
 */

const { createFactStore } = require('../factStore');

/**
 * @param {object} registry
 * @param {object} bundle — CanonicalRequirementBundle
 * @param {{ runGateA?: boolean, thresholds?: object, factStore?: object, weights?: object }} options
 */
function runRecipeWave(registry, bundle, options = {}) {
  const factStore = options.factStore || createFactStore();
  const baseInput = {
    fr: bundle.fr || [],
    nfr: bundle.nfr || [],
    uc: bundle.uc || [],
    bg: bundle.bg || [],
    br: bundle.br || [],
    bpm: bundle.bpm || [],
    capabilities: bundle.capabilities || [],
    tasks: bundle.tasks || [],
    traceLinks: bundle.traceLinks || [],
    dependencyDegree: bundle.dependencyDegree || {},
    scope: bundle.scope || [],
    baseline: bundle.baseline || undefined,
    context: bundle.context || {},
  };

  const recipeOpts = {
    factStore,
    context: {
      ...(bundle.context || {}),
      snapshotMeta: bundle.snapshotMeta || {},
      phase: 'requirement_analysis',
      constraints: bundle.context?.constraints || [],
      technology: bundle.context?.technology || [],
      objective: bundle.context?.objective || '',
    },
    allowedModes: ['recipe'],
  };

  const parallelNames = [
    'traceability_graph',
    'requirement_completeness',
    'requirement_consistency',
    'requirement_complexity',
  ];

  const results = {};
  for (const name of parallelNames) {
    results[name] = registry.execute(name, baseInput, recipeOpts);
  }

  const graph = results.traceability_graph?.data || { nodes: [], edges: [] };
  results.requirement_coverage = registry.execute(
    'requirement_coverage',
    {
      ...baseInput,
      graph,
      weights: options.weights,
      thresholds: options.thresholds,
    },
    recipeOpts
  );

  results.scope_analysis = registry.execute(
    'scope_analysis',
    {
      fr: baseInput.fr,
      scope: baseInput.scope,
      baseline: baseInput.baseline,
      context: recipeOpts.context,
      policy: { version: 'scope-v1' },
    },
    recipeOpts
  );

  let gateA = null;
  if (options.runGateA !== false) {
    gateA = registry.execute(
      'gate_a_requirement_quality',
      { thresholds: options.thresholds },
      {
        factStore,
        context: recipeOpts.context,
        allowedModes: ['validation'],
      }
    );
    results.gate_a_requirement_quality = gateA;
  }

  const storeObj = factStore.toObject();

  return {
    recipe: {
      traceability: results.traceability_graph?.data || null,
      coverage: results.requirement_coverage?.data || null,
      completeness: results.requirement_completeness?.data || null,
      consistency: results.requirement_consistency?.data || null,
      complexity: results.requirement_complexity?.data || null,
      scope: results.scope_analysis?.data || null,
    },
    gateA: gateA?.data || null,
    facts: storeObj.facts,
    factEntries: storeObj.factEntries,
    inputHashes: storeObj.inputHashes,
    results,
    meta: {
      toolCount: Object.keys(results).length,
      warningCount: Object.values(results).reduce(
        (acc, r) => acc + (r?.warnings?.length || 0),
        0
      ),
      snapshotMeta: bundle.snapshotMeta || null,
    },
  };
}

/**
 * Execute an on-demand tool by registry name.
 */
function runOnDemandTool(registry, name, input, factStore, context = {}) {
  return registry.execute(name, input, {
    factStore,
    context,
    allowedModes: ['on_demand'],
  });
}

module.exports = { runRecipeWave, runOnDemandTool };
