const { createEvidence } = require('../evidence/evidence');
const { runEffortEngine, applyEffortToContainer } = require('../engines/effort');
const {
  runRoleSkillPlanning,
  applyRoleSkillToContainer,
} = require('../engines/roleSkill');

/**
 * G9 Effort + role/skill planning — parity with legacy effortRoleAnalysis job.
 */
async function effort(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  let container = context.container || input.container || input;
  const toolData = input.toolData || {};

  const roleSkill = runRoleSkillPlanning(pack, container);
  container = applyRoleSkillToContainer(container, roleSkill);

  const engineResult = runEffortEngine(container, {
    historyMetrics: toolData.historyMetrics || null,
    maxEffortHours: toolData.maxEffortHours,
  });
  const updatedContainer = applyEffortToContainer(container, engineResult);

  const evidence = [
    createEvidence({
      sourceType: 'effort_model',
      sourceId: 'deterministic-v1',
      snapshotId,
      metric: 'total_effort_hours',
      value: engineResult.effort?.estimatedHoursTotal ?? 0,
      unit: 'hours',
      calculatedBy: 'EffortTool',
      ruleId: 'EFF-001',
    }),
  ];
  if (engineResult.effort?.totalStoryPoints != null) {
    evidence.push(
      createEvidence({
        sourceType: 'effort_model',
        sourceId: 'deterministic-v1',
        snapshotId,
        metric: 'total_story_points',
        value: engineResult.effort.totalStoryPoints,
        unit: 'points',
        calculatedBy: 'EffortTool',
        ruleId: 'EFF-ENGINE-002',
      })
    );
  }
  return {
    result: { engineResult, roleSkill, container: updatedContainer },
    evidence,
  };
}

module.exports = { effort };
