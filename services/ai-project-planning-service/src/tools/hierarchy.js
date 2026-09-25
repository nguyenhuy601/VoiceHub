const { createEvidence } = require('../evidence/evidence');
const { runHierarchyEngine, applyHierarchyToContainer } = require('../engines/hierarchy');

async function hierarchy(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || {};
  const result = runHierarchyEngine(pack);
  const updated = applyHierarchyToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'srs_pack',
      sourceId: 'hierarchy',
      snapshotId,
      metric: 'hierarchy_node_count',
      value: (result.items || result.nodes || []).length,
      unit: 'count',
      calculatedBy: 'HierarchyTool',
      ruleId: 'HIER-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { hierarchy };
