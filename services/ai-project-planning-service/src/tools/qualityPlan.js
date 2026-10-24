const { createEvidence } = require('../evidence/evidence');
const { isQualityPlanStructurallyOk } = require('../engines/qualityPlan');
const {
  runQualitySecGraph,
  isQualityPlanStructurallyOk: isOkFromSec,
} = require('../howSecs/quality/qualityGraph');

/** Quality — sec graph only. Heuristic+LLM enrich file is not a fallback. */
async function qualityPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || input;
  const container = context.container || input.container || {};
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;
  const toolData = input.toolData || context.toolData || {};
  const snapshot = input.snapshot || context.snapshot || null;

  const { result, containerPatch } = await runQualitySecGraph({
    pack,
    container,
    toolData,
    snapshot,
    env,
    generateJsonFn,
    contextPackage: input.contextPackage || context.contextPackage || null,
    snapshotId,
  });
  const plan = result.qualityPlan || {};
  const catalogCount = Array.isArray(plan.catalogPlan) ? plan.catalogPlan.length : 0;
  return {
    result: {
      qualityPlan: plan,
      structurallyOk: isOkFromSec(plan) || isQualityPlanStructurallyOk(plan),
      stub: false,
      container: containerPatch,
    },
    evidence: [
      createEvidence({
        sourceType: 'quality_plan',
        sourceId: result.meta?.source || 'fact_llm',
        snapshotId,
        metric: 'catalog_count',
        value: catalogCount,
        unit: 'count',
        calculatedBy: 'QualityPlanTool',
        ruleId: 'QUAL-SEC-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { qualityPlan };
