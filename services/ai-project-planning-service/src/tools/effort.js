const { createEvidence } = require('../evidence/evidence');
const { runEffortEngine, applyEffortToContainer } = require('../engines/effort');

/** G10 Effort estimation — deterministic engine adapter. */
async function effort(snapshot = {}, _context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;
  const container = snapshot.container || snapshot;
  const engineResult = runEffortEngine(container);
  const updatedContainer = applyEffortToContainer(container, engineResult);
  const evidence = [
    createEvidence({
      sourceType: 'effort_model',
      sourceId: 'deterministic-v1',
      snapshotId,
      metric: 'total_effort_hours',
      value: engineResult.effort.estimatedHoursTotal,
      unit: 'hours',
      calculatedBy: 'EffortTool',
      ruleId: 'EFF-ENGINE-001',
    }),
  ];
  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { effort };
