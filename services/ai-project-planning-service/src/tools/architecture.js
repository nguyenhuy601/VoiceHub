const { createEvidence } = require('../evidence/evidence');
const {
  runArchitectureEngine,
  applyArchitectureToContainer,
} = require('../engines/architecture');

/** G11 Architecture — heuristic engine + evidence + container apply */
async function architecture(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || input;
  const container = context.container || input.container || {};
  const result = runArchitectureEngine(container, pack);
  const updated = applyArchitectureToContainer(container, result);
  const components = result.components || result.items || [];

  const evidence = [
    createEvidence({
      sourceType: 'architecture_catalog',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'component_count',
      value: components.length,
      unit: 'count',
      calculatedBy: 'ArchitectureTool',
      ruleId: 'ARCH-HEUR-001',
    }),
  ];

  return {
    result: {
      components,
      dependencies: result.dependencies || [],
      constraints: result.constraints || [],
      items: result.items || components,
      chains: result.chains || [],
      stub: false,
      container: updated,
    },
    evidence,
  };
}

module.exports = { architecture };
