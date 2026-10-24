const { createEvidence } = require('../evidence/evidence');
const { runArchitectureSecGraph } = require('../howSecs/architecture/architectureGraph');

/**
 * Architecture — Semantic→Fact→LLM→Accept only.
 * Legacy heuristic invent (layer APIs / "X Store") is not a fallback.
 */
async function architecture(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || input;
  const container = context.container || input.container || {};
  const env = input.env || context.env || process.env;
  const toolData = input.toolData || context.toolData || {};
  const snapshot = input.snapshot || context.snapshot || null;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;

  const { result, containerPatch } = await runArchitectureSecGraph({
    pack,
    container,
    toolData,
    snapshot,
    env,
    generateJsonFn,
  });
  const components = result.components || result.items || [];
  const evidence = [
    createEvidence({
      sourceType: 'architecture_catalog',
      sourceId: result.meta?.source || 'fact_llm',
      snapshotId,
      metric: 'component_count',
      value: components.length,
      unit: 'count',
      calculatedBy: 'ArchitectureTool',
      ruleId: 'ARCH-SEC-TOOL-LLM-001',
    }),
  ];
  return {
    result: {
      components,
      dependencies: result.dependencies || [],
      constraints: result.constraints || [],
      items: result.items || components,
      chains: result.chains || [],
      openQuestions: result.openQuestions || [],
      stub: false,
      container: containerPatch,
      meta: { ...(result.meta || {}), inventForbidden: true, path: 'how_sec_tool_llm' },
    },
    evidence,
  };
}

module.exports = { architecture };
