const { createEvidence } = require('../evidence/evidence');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../engines/employeeMatching');
const {
  assembleHowToolContext,
  contextAllowsWork,
  scopeContainerTasksByContext,
} = require('../semanticLayer/howToolContext');

/** G9 Employee Matching — Fit → Feasible → featureOwner. */
async function employeeMatching(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const employees = toolData.employees || input.employees || [];
  const layer = await assembleHowToolContext({
    purpose: 'MATCHING',
    pack,
    container,
    toolData,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  const scoped = scopeContainerTasksByContext(container, layer);
  if (!contextAllowsWork(layer)) {
    return {
      result: { status: layer.status || layer.code, container, assignments: [] },
      evidence: [
        createEvidence({
          sourceType: 'matching',
          sourceId: layer.status || 'context_blocked',
          snapshotId,
          value: layer.status || layer.code,
          calculatedBy: 'EmployeeMatchingTool',
          ruleId: 'MATCH-CONTEXT',
        }),
      ],
    };
  }
  const engineResult = await runEmployeeMatching(pack, scoped, {
    poolItems: employees,
    constraints: toolData.constraints || null,
    bookedHoursByUserDay: toolData.bookedHoursByUserDay || null,
    meetingHoursByUserDay: toolData.meetingHoursByUserDay || null,
    requiredSkillIds:
      planningHints?.criticalSkillIds ||
      toolData.merged?.requiredSkillIds ||
      toolData.filterMeta?.requiredSkillIds ||
      null,
    frLinks: Array.isArray(toolData.merged?.frLinks)
      ? toolData.merged.frLinks
      : Array.isArray(input.merged?.frLinks)
        ? input.merged.frLinks
        : [],
    planningHints,
    project: context.project || input.project || null,
    org: context.org || input.org || null,
    env: context.env || process.env,
    projectStart:
      toolData.overview?.startDate ||
      input.overview?.startDate ||
      pack.overview?.startDate ||
      null,
  });
  const updatedContainer = applyMatchingToContainer(scoped, engineResult);
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
