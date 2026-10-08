const { createEvidence } = require('../evidence/evidence');
const {
  runDependencyEngine,
  applyDependencyToContainer,
} = require('../engines/dependency');

async function dependency(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const result = runDependencyEngine(container, { pack, planningHints });
  const updated = applyDependencyToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'dependency_model',
      sourceId: 'srs_then_heuristic',
      snapshotId,
      metric: 'dependency_edge_count',
      value: (result.edges || []).length,
      unit: 'count',
      calculatedBy: 'DependencyTool',
      ruleId: 'DEP-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { dependency };
