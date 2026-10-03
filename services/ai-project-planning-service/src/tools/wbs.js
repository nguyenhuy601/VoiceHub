const { createEvidence } = require('../evidence/evidence');
const { runWbsEngine, applyWbsToContainer } = require('../engines/wbs');

async function wbs(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const result = runWbsEngine(container);
  const updated = applyWbsToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'wbs_model',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'wbs_task_count',
      value: (result.tasks || updated.planning?.tasks || []).length,
      unit: 'count',
      calculatedBy: 'WbsTool',
      ruleId: 'WBS-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { wbs };
