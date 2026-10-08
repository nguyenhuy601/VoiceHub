const { createEvidence } = require('../evidence/evidence');
const { runInsightsEngine, applyInsightsToContainer } = require('../engines/insights');

async function insights(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || {};
  const result = runInsightsEngine(pack, container);
  const updated = applyInsightsToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'insights_model',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'insight_count',
      value: (result.items || result.insights || []).length,
      unit: 'count',
      calculatedBy: 'InsightsTool',
      ruleId: 'INS-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { insights };
