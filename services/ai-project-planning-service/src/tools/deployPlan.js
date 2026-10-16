const { createEvidence } = require('../evidence/evidence');
const {
  runDeployPlanEngine,
  applyDeployPlanToContainer,
  isDeployPlanStructurallyOk,
} = require('../engines/deployPlan');

/** Deploy / Release Plan — deterministic engine + container apply (plan-only). */
async function deployPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || {};
  const toolData =
    (input.toolData && typeof input.toolData === 'object' ? input.toolData : null) ||
    (context.toolData && typeof context.toolData === 'object' ? context.toolData : {}) ||
    {};
  const result = runDeployPlanEngine(container, toolData);
  const updated = applyDeployPlanToContainer(container, result);
  const plan = result.deployPlan || {};
  const envCount = Array.isArray(plan.envMatrix) ? plan.envMatrix.length : 0;

  const evidence = [
    createEvidence({
      sourceType: 'deploy_plan',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'env_matrix_count',
      value: envCount,
      unit: 'count',
      calculatedBy: 'DeployPlanTool',
      ruleId: 'DEP-HEUR-001',
    }),
    createEvidence({
      sourceType: 'deploy_plan',
      sourceId: 'heuristic',
      snapshotId,
      metric: 'rollback_steps',
      value: Array.isArray(plan.rollbackPlan?.steps) ? plan.rollbackPlan.steps.length : 0,
      unit: 'count',
      calculatedBy: 'DeployPlanTool',
      ruleId: 'DEP-HEUR-002',
    }),
  ];

  return {
    result: {
      deployPlan: plan,
      structurallyOk: isDeployPlanStructurallyOk(plan),
      stub: false,
      container: updated,
    },
    evidence,
  };
}

module.exports = { deployPlan };
