const { createEvidence } = require('../evidence/evidence');
const {
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
} = require('../engines/scheduleCapacity');

/** G10 Schedule — deterministic capacity engine adapter. */
async function schedule(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || {};
  const engineResult = runScheduleCapacity(container, {
    projectStart:
      toolData.overview?.startDate ||
      input.overview?.startDate ||
      pack.overview?.startDate ||
      null,
    projectDeadline:
      toolData.overview?.deadline ||
      pack.overview?.deadline ||
      null,
    calendar: toolData.calendar || input.calendar || null,
    meetingHoursByUserDay:
      toolData.meetingHoursByUserDay &&
      typeof toolData.meetingHoursByUserDay === 'object' &&
      !Array.isArray(toolData.meetingHoursByUserDay)
        ? toolData.meetingHoursByUserDay
        : input.meetingHoursByUserDay || {},
  });
  const updatedContainer = applyScheduleCapacityToContainer(container, engineResult);

  const evidence = [
    createEvidence({
      sourceType: 'calendar',
      sourceId: 'snapshot',
      snapshotId,
      metric: 'scheduled_tasks',
      value: new Set((engineResult.schedule || []).map((row) => row.taskId)).size,
      unit: 'count',
      calculatedBy: 'ScheduleTool',
      ruleId: 'SCH-001',
    }),
  ];

  return { result: { engineResult, container: updatedContainer }, evidence };
}

module.exports = { schedule };
