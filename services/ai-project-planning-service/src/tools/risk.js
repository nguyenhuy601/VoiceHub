const { createEvidence } = require('../evidence/evidence');
const { runRiskEngine, applyRiskToContainer } = require('../engines/risk');

/** G12 Risk — heuristic engine + evidence + container apply */
async function risk(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || {};
  const result = runRiskEngine(container);
  const updated = applyRiskToContainer(container, result);
  const risks = result.risks || result.items || [];

  const evidence = [
    createEvidence({
      sourceType: 'risk_catalog',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'risk_count',
      value: risks.length,
      unit: 'count',
      calculatedBy: 'RiskTool',
      ruleId: 'RISK-HEUR-001',
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
