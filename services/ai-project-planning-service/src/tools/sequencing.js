const { createEvidence } = require('../evidence/evidence');
const {
  runSequencingCpm,
  applySequencingCpmToContainer,
} = require('../engines/sequencingCpm');

/** G10 Sequencing / CPM — deterministic engine adapter. */
async function sequencing(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const container = context.container || input.container || input;
  const engineResult = runSequencingCpm(container);
  const updatedContainer = applySequencingCpmToContainer(container, engineResult);
  const duration =
    engineResult.theoreticalCpm?.projectDurationHours ??
    engineResult.sequence?.projectDurationHours ??
    0;
  const evidence = [
    createEvidence({
      sourceType: 'cpm_model',
      sourceId: 'deterministic-v1',
      snapshotId,
      metric: 'project_duration_hours',
      value: duration,
      unit: 'hours',
      calculatedBy: 'SequencingTool',
      ruleId: 'CPM-001',
    }),
  ];
  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { sequencing };
