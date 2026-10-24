const { createEvidence } = require('../evidence/evidence');
const { runEffortRolesSecGraph } = require('../howSecs/effortRoles/effortRolesGraph');

/** Effort & roles — sec graph (deterministic hours inside graph, LLM overlay). No second heuristic tool path. */
async function effort(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || context.toolData || {};
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;

  const { result, containerPatch } = await runEffortRolesSecGraph({
    pack,
    container,
    toolData,
    env,
    generateJsonFn,
  });
  const engineResult = result.engineResult || {};
  return {
    result: {
      engineResult,
      roleSkill: result.roleSkill,
      container: containerPatch || result.container,
      meta: result.meta,
    },
    evidence: [
      createEvidence({
        sourceType: 'effort_model',
        sourceId: result.meta?.source || 'fact_llm',
        snapshotId,
        metric: 'total_effort_hours',
        value: engineResult.effort?.estimatedHoursTotal ?? 0,
        unit: 'hours',
        calculatedBy: 'EffortTool',
        ruleId: 'EFF-SEC-TOOL-LLM-001',
      }),
    ],
  };
}

module.exports = { effort };
