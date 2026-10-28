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
const {
  assembleHowToolContext,
  contextAllowsWork,
  scopeContainerTasksByContext,
} = require('../semanticLayer/howToolContext');

function leafTaskIdSet(container) {
  const set = new Set();
  for (const task of Array.isArray(container?.planning?.tasks) ? container.planning.tasks : []) {
    const level = String(task?.level || 'task').toLowerCase();
    if (level !== 'task' && level !== 'subtask' && task?.level) continue;
    const id = String(task?.id || task?.taskId || '').trim();
    if (id) set.add(id);
  }
  return set;
}

/**
 * True when recommendations still cover current WBS leaves.
 * Stale recs (old task ids after WBS re-run) must force rematch — otherwise
 * ScheduleCapacity assigns orphans → Phân công shows IDs, Lịch stamps 0 dates.
 */
function recommendationsCoverCurrentLeaves(container) {
  const leaves = leafTaskIdSet(container);
  if (!leaves.size) return true;
  const recs = Array.isArray(container?.resource?.recommendations)
    ? container.resource.recommendations
    : [];
  if (!recs.length) return false;
  let hit = 0;
  for (const row of recs) {
    if (leaves.has(String(row?.taskId || '').trim())) hit += 1;
  }
  return hit >= Math.ceil(leaves.size * 0.8);
}

function clearStaleMatchingResource(container) {
  return {
    ...container,
    resource: {
      ...(container?.resource || {}),
      recommendations: [],
      assignments: [],
      schedule: [],
      unassigned: [],
      matching: {
        ...((container?.resource?.matching && typeof container.resource.matching === 'object')
          ? container.resource.matching
          : {}),
        unassigned: [],
        overload: [],
      },
    },
  };
}

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

  const {
    validateScheduleInputs,
    pickStartDate,
  } = require('../orchestration/validateScheduleInputs');
  const gate = validateScheduleInputs({ pack, toolData, input, container });
  if (!gate.ok) {
    const err = new Error(gate.error.message);
    err.code = gate.error.code || 'INPUT_MISSING';
    err.retryable = false;
    err.blockedBy = gate.blockedBy;
    throw err;
  }

  const calendar = toolData.calendar || input.calendar || pack.calendar || null;
  const resolvedStart =
    (typeof gate.startDate === 'string' && gate.startDate) ||
    pickStartDate(pack, toolData, input) ||
    null;

  const layer = await assembleHowToolContext({
    purpose: 'SCHEDULE',
    pack,
    container,
    toolData,
    snapshot: input.snapshot || context.snapshot || null,
    snapshotId,
    contextPackage: input.contextPackage || context.contextPackage || null,
  });
  let scoped = scopeContainerTasksByContext(container, layer);

  // Fold matching into Schedule when shortlists missing OR stale vs current WBS leaves.
  const leavesCovered = recommendationsCoverCurrentLeaves(scoped);
  const hasRecs = Array.isArray(scoped?.resource?.recommendations)
    ? scoped.resource.recommendations.length > 0
    : false;
  const needsRematch = !hasRecs || !leavesCovered;
  let matchingMeta = null;
  if (contextAllowsWork(layer) && needsRematch && Array.isArray(employees) && employees.length) {
    try {
      if (hasRecs && !leavesCovered) {
        console.info(
          '[ScheduleTool] rematch_stale_recs leaves=%s recs=%s',
          leafTaskIdSet(scoped).size,
          scoped.resource.recommendations.length
        );
        scoped = clearStaleMatchingResource(scoped);
      }
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
        projectStart: resolvedStart,
      });
      scoped = applyMatchingToContainer(scoped, matchingResult);
      matchingMeta = {
        recommendationCount: Array.isArray(matchingResult?.recommendations)
          ? matchingResult.recommendations.length
          : 0,
        rematch: Boolean(hasRecs && !leavesCovered),
      };
    } catch (err) {
      console.warn('[ScheduleTool] matching_fold_failed', err?.message || err);
      matchingMeta = { error: String(err?.message || err).slice(0, 160) };
    }
  }

  // Capacity engine is deterministic (not Sprint allocation). Always run even if
  // semantic layer is INSUFFICIENT — skipping left Gate2 Lịch empty while prior
  // fold assignments still showed on Monitor.
  const engineResult = runScheduleCapacity(scoped, {
    projectStart: resolvedStart,
    projectDeadline: toolData.overview?.deadline || pack.overview?.deadline || null,
    calendar,
    meetingHoursByUserDay:
      toolData.meetingHoursByUserDay &&
      typeof toolData.meetingHoursByUserDay === 'object' &&
      !Array.isArray(toolData.meetingHoursByUserDay)
        ? toolData.meetingHoursByUserDay
        : input.meetingHoursByUserDay || {},
  });
  if (!contextAllowsWork(layer) && engineResult && typeof engineResult === 'object') {
    engineResult.meta = {
      ...(engineResult.meta || {}),
      semanticLayerStatus: layer?.status || layer?.code || 'INSUFFICIENT',
      capacityRanDespiteLayer: true,
    };
  }
  let updatedContainer = applyScheduleCapacityToContainer(scoped, engineResult);

  if (contextAllowsWork(layer)) {
    const timing = await attachTaskTimingTexts({
      container: updatedContainer,
      pack,
    });
    updatedContainer = timing.container;
  }

  // Sprint: LLM propose Story→Sprint + tool validate (no heuristic fallback).
  let sprintPlanningMeta = null;
  if (contextAllowsWork(layer) && updatedContainer?.planning?.schedulePlan) {
    try {
      const { enrichScheduleWithSprintPlanning } = require('../engines/enrichScheduleWithSprintPlanning');
      const enriched = await enrichScheduleWithSprintPlanning({
        pack,
        container: updatedContainer,
        env: context.env || process.env,
        generateJsonFn: context.generateJsonFn || input.generateJsonFn || null,
        contextPackage: input.contextPackage || context.contextPackage || null,
        snapshot: input.snapshot || context.snapshot || null,
        snapshotId,
        runId: context.runId || input.runId || null,
        abortSignal: context.abortSignal || input.abortSignal || null,
        checkpointer: context.checkpointer || input.checkpointer || null,
      });
      updatedContainer = enriched.container;
      sprintPlanningMeta = {
        ...(enriched.meta || {}),
        executionStatus: enriched.executionStatus || enriched.meta?.executionStatus || null,
        sprintPlanningReady: Boolean(enriched.meta?.sprintPlanningReady),
        errors: enriched.errors || enriched.meta?.errors || [],
      };
      sprintPlanningMeta.scheduleSprintReady = Boolean(sprintPlanningMeta.sprintPlanningReady);
    } catch (err) {
      console.warn('[ScheduleTool] sprint_planning_enrich_failed', err?.message || err);
      sprintPlanningMeta = {
        error: String(err?.message || err).slice(0, 160),
        executionStatus: 'failed',
        sprintPlanningReady: false,
        scheduleSprintReady: false,
        errors: [{ code: 'enrich_throw', message: String(err?.message || err).slice(0, 160) }],
      };
    }
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
  if (sprintPlanningMeta && updatedContainer?.planning?.schedulePlan?.sprints) {
    evidence.push(
      createEvidence({
        sourceType: 'schedule_plan',
        sourceId: 'sprint_enrich',
        snapshotId,
        metric: 'sprint_count',
        value: updatedContainer.planning.schedulePlan.sprints.length,
        unit: 'count',
        calculatedBy: 'ScheduleTool',
        ruleId: 'SCH-SPRINT-001',
      })
    );
  }

  return {
    result: { engineResult, container: updatedContainer, matchingMeta, sprintPlanningMeta },
    evidence,
  };
}

module.exports = { schedule };
