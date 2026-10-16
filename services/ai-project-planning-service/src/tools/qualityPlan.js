const { createEvidence } = require('../evidence/evidence');
const {
  runQualityPlanEngine,
  applyQualityPlanToContainer,
  isQualityPlanStructurallyOk,
} = require('../engines/qualityPlan');
const { enrichQualityPlanWithLlm } = require('../engines/qualityPlanLlm');

/** G18 Quality — deterministic base + optional LLM catalog enrich */
async function qualityPlan(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || input;
  const container = context.container || input.container || {};
  const env = input.env || context.env || process.env;
  let result = runQualityPlanEngine(container, pack);
  result = await enrichQualityPlanWithLlm(result, {
    pack,
    env,
    generateJsonFn: input.generateJsonFn || context.generateJsonFn || null,
  });
  const updated = applyQualityPlanToContainer(container, result);
  const plan = result.qualityPlan || {};
  const catalogCount = Array.isArray(plan.catalogPlan) ? plan.catalogPlan.length : 0;
  const acCount = Array.isArray(plan.acCoverage) ? plan.acCoverage.length : 0;

  const evidence = [
    createEvidence({
      sourceType: 'quality_plan',
      sourceId: result.meta?.source || 'heuristic',
      snapshotId,
      metric: 'catalog_count',
      value: catalogCount,
      unit: 'count',
      calculatedBy: 'QualityPlanTool',
      ruleId: result.meta?.llmCatalogAdded ? 'QUAL-LLM-001' : 'QUAL-HEUR-001',
    }),
    createEvidence({
      sourceType: 'quality_plan',
      sourceId: result.meta?.source || 'heuristic',
      snapshotId,
      metric: 'ac_coverage_count',
      value: acCount,
      unit: 'count',
      calculatedBy: 'QualityPlanTool',
      ruleId: 'QUAL-HEUR-002',
    }),
  ];

  return {
    result: {
      qualityPlan: plan,
      structurallyOk: isQualityPlanStructurallyOk(plan),
      stub: false,
      container: updated,
    },
    evidence,
  };
}

module.exports = { qualityPlan };
