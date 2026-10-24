const { createEvidence } = require('../evidence/evidence');
const { isDeployPlanStructurallyOk } = require('../engines/deployPlan');
const {
  runDeploySecGraph,
  isDeployPlanStructurallyOk: isOkSec,
} = require('../howSecs/deploy/deployGraph');

/** Deploy — sec graph only (SNAP env matrix). No separate heuristic tool path. */
async function deployPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || {};
  const pack = context.pack || input.pack || {};
  const toolData =
    (input.toolData && typeof input.toolData === 'object' ? input.toolData : null) ||
    (context.toolData && typeof context.toolData === 'object' ? context.toolData : {}) ||
    {};
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;

  const { result, containerPatch } = await runDeploySecGraph({
    pack,
    container,
    toolData,
    env,
    generateJsonFn,
  });
  const plan = result.deployPlan || {};
  return {
    result: {
      deployPlan: plan,
      structurallyOk: isOkSec(plan) || isDeployPlanStructurallyOk(plan),
      stub: false,
      container: containerPatch,
    },
    evidence: [
      createEvidence({
        sourceType: 'deploy_plan',
        sourceId: result.meta?.source || 'fact_llm',
        snapshotId,
        metric: 'env_matrix_count',
        value: Array.isArray(plan.envMatrix) ? plan.envMatrix.length : 0,
        unit: 'count',
        calculatedBy: 'DeployPlanTool',
        ruleId: 'DEPLOY-SEC-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { deployPlan };
