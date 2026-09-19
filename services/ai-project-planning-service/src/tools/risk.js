const { createEvidence } = require('../evidence/evidence');

/** G12 Risk — deterministic stub + evidence */
async function risk(snapshot = {}, _context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;

  const evidence = [
    createEvidence({
      sourceType: 'risk_catalog',
      sourceId: 'stub',
      snapshotId,
      metric: 'risk_count',
      value: 0,
      unit: 'count',
      calculatedBy: 'RiskTool',
      ruleId: 'RISK-STUB-001',
    }),
  ];

  return {
    result: {
      risks: [],
      maxSeverity: null,
      stub: true,
    },
    evidence,
  };
}

module.exports = { risk };
