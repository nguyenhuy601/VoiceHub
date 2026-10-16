const { createEvidence } = require('../evidence/evidence');
const { runRiskEngine, applyRiskToContainer } = require('../engines/risk');
const { enrichRiskWithLlm } = require('../engines/riskLlm');

/** G12 Risk — heuristic base + optional LLM enrich */
async function risk(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const env = input.env || context.env || process.env;
  let result = runRiskEngine(container);
  result = await enrichRiskWithLlm(result, {
    pack,
    container,
    env,
    generateJsonFn: input.generateJsonFn || context.generateJsonFn || null,
  });
  const updated = applyRiskToContainer(container, result);
  const risks = result.risks || result.items || [];

  const evidence = [
    createEvidence({
      sourceType: 'risk_catalog',
      sourceId: result.meta?.source || 'heuristic',
      snapshotId,
      metric: 'risk_count',
      value: risks.length,
      unit: 'count',
      calculatedBy: 'RiskTool',
      ruleId: result.meta?.llmRisksAdded ? 'RISK-LLM-001' : 'RISK-HEUR-001',
    }),
  ];

  return {
    result: {
      risks,
      items: result.items || risks,
      maxSeverity: result.maxSeverity,
      stub: false,
      container: updated,
    },
    evidence,
  };
}

module.exports = { risk };
