const { createEvidence } = require('../evidence/evidence');
const {
  runScheduleCapacity,
  applyScheduleCapacityToContainer,
} = require('../engines/scheduleCapacity');
const {
  runEmployeeMatching,
  applyMatchingToContainer,
} = require('../engines/employeeMatching');
const { attachTaskTimingTexts } = require('../engines/taskScheduleText');
const { assembleHowToolContext, contextAllowsWork } = require('../semanticLayer/howToolContext');

/**
 * G10 Schedule — deterministic only (policy: heuristicOnlyTools).
 * Matching (ex-EmployeeMatchingTool) runs here before capacity/CPM so Gate2
 * Phân công + Lịch share one phase node. timeText from CPM template (no LLM).
 */
async function schedule(input = {}, context = {}) {
  const snapshotId = input.snapshotId || input.id || null;
  const pack = context.pack || input.pack || {};
  const container = context.container || input.container || input;
  const toolData = input.toolData || context.toolData || {};
  const planningHints = input.planningHints || context.planningHints || null;
  const employees = toolData.employees || input.employees || [];
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
  let scoped = contextAllowsWork(layer)
    ? {
        ...container,
        planning: {
          ...(container.planning || {}),
          tasks: sourceTasks.filter((task) => allowed.has(String(task.id || task.taskId || ''))),
        },
      }
    : container;

  // Fold matching into Schedule when shortlists are missing (phase no longer has MatchingTool).
  const hasRecs = Array.isArray(scoped?.resource?.recommendations)
    ? scoped.resource.recommendations.length > 0
    : false;
  let matchingMeta = null;
  if (contextAllowsWork(layer) && !hasRecs && Array.isArray(employees) && employees.length) {
    try {
      const matchingResult = await runEmployeeMatching(pack, scoped, {
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
      scoped = applyMatchingToContainer(scoped, matchingResult);
      matchingMeta = {
        recommendationCount: Array.isArray(matchingResult?.recommendations)
          ? matchingResult.recommendations.length
          : 0,
      };
    } catch (err) {
      console.warn('[ScheduleTool] matching_fold_failed', err?.message || err);
      matchingMeta = { error: String(err?.message || err).slice(0, 160) };
    }
  }

  const engineResult = contextAllowsWork(layer)
    ? runScheduleCapacity(scoped, {
        projectStart:
          toolData.overview?.startDate ||
          input.overview?.startDate ||
          pack.overview?.startDate ||
          null,
        projectDeadline: toolData.overview?.deadline || pack.overview?.deadline || null,
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

  if (contextAllowsWork(layer)) {
    const timing = await attachTaskTimingTexts({
      container: updatedContainer,
      pack,
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
  if (matchingMeta && matchingMeta.recommendationCount != null) {
    evidence.push(
      createEvidence({
        sourceType: 'matching',
        sourceId: 'schedule_fold',
        snapshotId,
        metric: 'recommendation_count',
        value: matchingMeta.recommendationCount,
        unit: 'count',
        calculatedBy: 'ScheduleTool',
        ruleId: 'SCH-MATCH-001',
      })
    );
  }

  return { result: { engineResult, container: updatedContainer, matchingMeta }, evidence };
}

module.exports = { schedule };
