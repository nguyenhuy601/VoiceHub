const { createEvidence } = require('../evidence/evidence');
const {
  runArchitectureEngine,
  applyArchitectureToContainer,
} = require('../engines/architecture');
const { enrichArchitectureWithLlm } = require('../engines/architectureLlm');

/** G11 Architecture — heuristic base + optional LLM enrich (HOW_ARCH_LLM / HOW_SEMANTIC_LLM) */
async function architecture(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || input;
  const container = context.container || input.container || {};
  const env = input.env || context.env || process.env;
  let result = runArchitectureEngine(container, pack);
  result = await enrichArchitectureWithLlm(result, {
    pack,
    container,
    env,
    generateJsonFn: input.generateJsonFn || context.generateJsonFn || null,
  });
  const updated = applyArchitectureToContainer(container, result);
  const components = result.components || result.items || [];

  const evidence = [
    createEvidence({
      sourceType: 'architecture_catalog',
      sourceId: result.meta?.source || 'heuristic',
      snapshotId,
      metric: 'component_count',
      value: components.length,
      unit: 'count',
      calculatedBy: 'ArchitectureTool',
      ruleId: result.meta?.llmCalls ? 'ARCH-LLM-001' : 'ARCH-HEUR-001',
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
