const { createEvidence } = require('../evidence/evidence');
const { runDependencySecGraph } = require('../howSecs/dependencies/dependencyGraph');

/** Dependency — Semantic→Fact→Propose→Accept. No same-area heuristic engine fallback. */
async function dependency(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;

  const { result, containerPatch } = await runDependencySecGraph({
    pack,
    container,
    planningHints,
    env,
    generateJsonFn,
    toolData: input.toolData || context.toolData || {},
    contextPackage: input.contextPackage || context.contextPackage || null,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
  });
  const evidence = [
    createEvidence({
      sourceType: 'dependency_model',
      sourceId: result.meta?.source || 'fact_llm',
      snapshotId,
      metric: 'dependency_edge_count',
      value: (result.edges || []).length,
      unit: 'count',
      calculatedBy: 'DependencyTool',
      ruleId: 'DEP-SEC-TOOL-LLM-001',
    }),
  ];
  return {
    result: {
      ...result,
      tool: result.candidateTool || {
        tool: 'dependency_candidate',
        status: 'success',
        data: { candidates: [], unresolvedTaskIds: [] },
      },
      container: containerPatch,
    },
    evidence,
  };
}

module.exports = { dependency };
