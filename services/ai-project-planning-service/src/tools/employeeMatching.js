const { createEvidence } = require('../evidence/evidence');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../engines/employeeMatching');

/** G9 Employee Matching — Fit → Feasible → featureOwner. */
async function employeeMatching(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const employees = toolData.employees || input.employees || [];
  const engineResult = await runEmployeeMatching(pack, container, {
    poolItems: employees,
    constraints: toolData.constraints || null,
    bookedHoursByUserDay: toolData.bookedHoursByUserDay || null,
    meetingHoursByUserDay: toolData.meetingHoursByUserDay || null,
    requiredSkillIds:
      planningHints?.criticalSkillIds ||
      toolData.merged?.requiredSkillIds ||
      toolData.filterMeta?.requiredSkillIds ||
      null,
    planningHints,
    projectStart:
      toolData.overview?.startDate ||
      input.overview?.startDate ||
      pack.overview?.startDate ||
      null,
  });
  const updatedContainer = applyMatchingToContainer(container, engineResult);
  const capacityValues = engineResult.recommendations.flatMap((rec) =>
    (rec.candidates || rec.shortlist || []).map((entry) => Number(entry.available_capacity) || 0)
  );
  const totalAvailable = capacityValues.reduce((sum, value) => sum + value, 0);
  const evidence = [
    createEvidence({
      sourceType: 'employee_capacity',
      sourceId: 'pool',
      snapshotId,
      metric: 'candidate_count',
      value: engineResult.recommendations.reduce(
        (count, item) => count + (item.candidates || item.shortlist || []).length,
        0
      ),
      unit: 'count',
      calculatedBy: 'EmployeeMatchingTool',
      ruleId: 'MATCH-001',
    }),
    createEvidence({
      sourceType: 'employee_capacity',
      sourceId: 'pool',
      snapshotId,
      metric: 'available_capacity',
      value: Math.round(totalAvailable * 100) / 100,
      unit: 'hours',
      calculatedBy: 'EmployeeMatchingTool',
      ruleId: 'CAP-003',
    }),
  ];
  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { employeeMatching };
