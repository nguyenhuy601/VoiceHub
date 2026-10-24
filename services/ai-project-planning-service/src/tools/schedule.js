const { createEvidence } = require('../evidence/evidence');
const {
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
} = require('../engines/scheduleCapacity');
const { isHowSecToolLlmOn } = require('../howSecs/howSecToolLlmFlag');
const { runSprintSecGraph } = require('../howSecs/sprint/sprintGraph');
const { runReleasesSecGraph } = require('../howSecs/releases/releasesGraph');
const { attachTaskTimingTexts } = require('../engines/taskScheduleText');
const { assembleHowToolContext, contextAllowsWork } = require('../semanticLayer/howToolContext');

/** G10 Schedule — deterministic capacity; optional Releases sec naming (real windows only). */
async function schedule(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || context.toolData || {};
  const env = input.env || context.env || process.env;
  const generateJsonFn = input.generateJsonFn || context.generateJsonFn || null;
  const layer = await assembleHowToolContext({
    purpose: 'SCHEDULE',
    pack,
    container,
    toolData,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  const allowed = new Set((layer.requiredData?.tasks || []).map((task) => task.id));
  const sourceTasks = Array.isArray(container?.planning?.tasks) ? container.planning.tasks : [];
  const scoped = contextAllowsWork(layer)
    ? {
        ...container,
        planning: {
          ...(container.planning || {}),
          tasks: sourceTasks.filter((task) => allowed.has(String(task.id || task.taskId || ''))),
        },
      }
    : container;

  const engineResult = contextAllowsWork(layer)
    ? runScheduleCapacity(scoped, {
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
    })
    : { status: layer.status || layer.code || 'INSUFFICIENT', schedule: [] };
  let updatedContainer = applyScheduleCapacityToContainer(scoped, engineResult);

  if (contextAllowsWork(layer) && isHowSecToolLlmOn('sprint', env)) {
    const { containerPatch } = await runSprintSecGraph({
      pack,
      container: updatedContainer,
      env,
      generateJsonFn,
      contextPackage: input.contextPackage || context.contextPackage || null,
      snapshot: input.snapshot || context.snapshot || null,
      snapshotId,
    });
    if (containerPatch) updatedContainer = containerPatch;
  }

  if (contextAllowsWork(layer) && isHowSecToolLlmOn('releases', env)) {
    const { containerPatch } = await runReleasesSecGraph({
      pack,
      container: updatedContainer,
      env,
      generateJsonFn,
      contextPackage: input.contextPackage || context.contextPackage || null,
      snapshot: input.snapshot || context.snapshot || null,
      snapshotId,
    });
    if (containerPatch) updatedContainer = containerPatch;
  }

  if (contextAllowsWork(layer)) {
    const timing = await attachTaskTimingTexts({
      container: updatedContainer,
      pack,
      env,
      generateJsonFn,
    });
    updatedContainer = timing.container;
  }

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
