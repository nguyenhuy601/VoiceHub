const { createEvidence } = require('../evidence/evidence');
const {
  runProjectPlanEngine,
  applyProjectPlanToContainer,
} = require('../engines/projectPlan');
const {
  assembleHowToolContext,
  contextAllowsWork,
  scopeContainerTasksByContext,
} = require('../semanticLayer/howToolContext');

async function projectPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const layer = await assembleHowToolContext({
    purpose: 'PROJECT_PLAN',
    pack,
    container,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  const scoped = scopeContainerTasksByContext(container, layer);
  const result = contextAllowsWork(layer)
    ? runProjectPlanEngine(scoped)
    : { status: layer.status || layer.code, executionPlan: { taskCount: 0 } };
  const updated = applyProjectPlanToContainer(scoped, result);
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
