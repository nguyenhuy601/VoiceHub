const { createEvidence } = require('../evidence/evidence');
const {
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
} = require('../engines/scheduleCapacity');

/** G10 Schedule — deterministic capacity engine adapter. */
async function schedule(snapshot = {}, _context = {}) {
  const snapshotId = snapshot.snapshotId || snapshot.id || null;
  const container = snapshot.container || snapshot;
  const toolData = snapshot.toolData || {};
  const engineResult = runScheduleCapacity(container, {
    projectStart: toolData.overview?.startDate,
    calendar: toolData.calendar,
    meetingHoursByUserDay: toolData.meetingHoursByUserDay,
  });
  const updatedContainer = applyScheduleCapacityToContainer(container, engineResult);

  const evidence = [
    createEvidence({
      sourceType: 'calendar',
      sourceId: 'snapshot',
      snapshotId,
      metric: 'scheduled_tasks',
      value: new Set(engineResult.schedule.map((row) => row.taskId)).size,
      unit: 'count',
      calculatedBy: 'ScheduleTool',
      ruleId: 'SCH-ENGINE-001',
    }),
  ];

  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { schedule };
