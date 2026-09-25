const { createEvidence } = require('../evidence/evidence');
const {
  runCapabilityEngine,
  applyCapabilityToContainer,
} = require('../engines/capability');

async function capability(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || {};
  const result = runCapabilityEngine(pack, {
    hierarchy: container.analyses?.hierarchy,
  });
  const updated = applyCapabilityToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'capability_model',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'capability_item_count',
      value: (result.items || []).length,
      unit: 'count',
      calculatedBy: 'CapabilityTool',
      ruleId: 'CAPA-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { capability };
