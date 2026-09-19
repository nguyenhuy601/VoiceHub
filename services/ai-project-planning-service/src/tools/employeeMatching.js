const { createEvidence } = require('../evidence/evidence');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../engines/employeeMatching');

/** G9 Employee Matching — deterministic engine adapter. */
async function employeeMatching(snapshot = {}, context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;
  const container = snapshot.container || snapshot;
  const employees = snapshot.toolData?.employees || snapshot.employees || [];
  const engineResult = await runEmployeeMatching(context.pack || {}, container, {
    poolItems: employees,
  });
  const updatedContainer = applyMatchingToContainer(container, engineResult);
  const evidence = [
    createEvidence({
      sourceType: 'employee_capacity',
      sourceId: 'pool',
      snapshotId,
      metric: 'candidate_count',
      value: engineResult.recommendations.reduce(
        (count, item) => count + item.shortlist.length,
        0
      ),
      unit: 'count',
      calculatedBy: 'EmployeeMatchingTool',
      ruleId: 'MATCH-ENGINE-001',
    }),
  ];
  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { employeeMatching };
