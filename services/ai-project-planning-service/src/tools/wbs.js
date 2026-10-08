const { createEvidence } = require('../evidence/evidence');
const { runWbsEngineAsync, applyWbsToContainer } = require('../engines/wbs');

async function wbs(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const runId = context.runId || input.runId || null;
  const generationId = context.generationId || input.generationId || runId || null;
  const result = await runWbsEngineAsync(container, {
    pack,
    planningHints,
    generateJsonFn: input.generateJsonFn,
    env: input.env,
    runId,
    generationId,
  });
  const updated = applyWbsToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'wbs_model',
      sourceId: result.meta?.source || 'hierarchy',
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
