const { createEvidence } = require('../evidence/evidence');
const {
  runProjectPlanEngine,
  applyProjectPlanToContainer,
} = require('../engines/projectPlan');

async function projectPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const result = runProjectPlanEngine(container);
  const updated = applyProjectPlanToContainer(container, result);
  const evidence = [
    createEvidence({
      sourceType: 'project_plan',
      sourceId: 'assemble',
      snapshotId,
      metric: 'plan_work_count',
      value:
        result.executionPlan?.taskCount ??
        result.executionPlan?.workCount ??
        (Array.isArray(updated.planning?.tasks) ? updated.planning.tasks.length : 0),
      unit: 'count',
      calculatedBy: 'ProjectPlanTool',
      ruleId: 'PLAN-ENGINE-001',
    }),
  ];
  return { result: { ...result, container: updated }, evidence };
}

module.exports = { projectPlan };
