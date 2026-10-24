const { createEvidence } = require('../evidence/evidence');
const { runRiskSecGraph } = require('../howSecs/risks/riskGraph');

/** Risks — Semantic→Fact→LLM→Accept. No heuristic risk catalog fallback. */
async function risk(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;

  const { result, containerPatch } = await runRiskSecGraph({
    pack,
    container,
    env,
    generateJsonFn,
    contextPackage: input.contextPackage || context.contextPackage || null,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
  });
  const risks = result.risks || result.items || [];
  return {
    result: {
      risks,
      items: result.items || risks,
      maxSeverity: result.maxSeverity,
      openQuestions: result.openQuestions || [],
      stub: false,
      container: containerPatch,
    },
    evidence: [
      createEvidence({
        sourceType: 'risk_catalog',
        sourceId: result.meta?.source || 'fact_llm',
        snapshotId,
        metric: 'risk_count',
        value: risks.length,
        unit: 'count',
        calculatedBy: 'RiskTool',
        ruleId: 'RISK-SEC-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { risk };
