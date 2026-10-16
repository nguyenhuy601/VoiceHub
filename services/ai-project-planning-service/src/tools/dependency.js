const { createEvidence } = require('../evidence/evidence');
const {
  runDependencyEngine,
  applyDependencyToContainer,
} = require('../engines/dependency');
const { enrichDependencyWithLlm } = require('../engines/dependencyLlm');

/** Dependency — SRS/heuristic base + optional LLM edge enrich */
async function dependency(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const env = input.env || context.env || process.env;
  let result = runDependencyEngine(container, { pack, planningHints });
  result = await enrichDependencyWithLlm(result, {
    pack,
    container,
    env,
    generateJsonFn: input.generateJsonFn || context.generateJsonFn || null,
  });
  const updated = applyDependencyToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'dependency_model',
      sourceId: result.meta?.source || 'srs_then_heuristic',
      snapshotId,
      metric: 'dependency_edge_count',
      value: (result.edges || []).length,
      unit: 'count',
      calculatedBy: 'DependencyTool',
      ruleId: result.meta?.llmEdgesAdded ? 'DEP-LLM-001' : 'DEP-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { dependency };
