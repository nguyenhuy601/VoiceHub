/**
 * HOW tool context/input builders shared by ReAct executeHowToolCall.
 * Sequential runToolsSequence / runHowPhaseTools removed — HOW uses howPhaseGraph.
 */

const { buildPlanningHints } = require('./buildPlanningHints');

function emptyContainer() {
  return {
    planning: {},
    resource: {},
    analyses: {},
    phaseRuns: {},
  };
}

function buildToolContext({
  pack,
  toolData,
  container,
  runId,
  generationId,
  contextPackage = null,
  toolName = null,
}) {
  // WbsTool: only approved SRS (via pack) + container write-back — no RAG / employees / calendar.
  if (toolName === 'WbsTool') {
    return {
      contextName: 'planning',
      pack: pack || {},
      container,
      runId: runId || null,
      generationId: generationId || runId || null,
      contextPackage: contextPackage || null,
      approvedSrs: true,
      requiresSatisfied: { approvedSrs: true },
    };
  }

  const hasEmployees =
    Array.isArray(toolData?.employees) ||
    Array.isArray(container?.resource?.employees);
  // RULE-SCH-01: calendarSnapshot only when real startDate or calendar object exists.
  const { validateScheduleInputs } = require('./validateScheduleInputs');
  const scheduleGate =
    toolName === 'ScheduleTool'
      ? validateScheduleInputs({ pack, toolData, container })
      : null;
  const hasCalendar =
    scheduleGate?.ok ||
    toolData?.calendar != null ||
    pack?.overview?.startDate != null;

  return {
    contextName: 'planning',
    pack: pack || {},
    container,
    runId: runId || null,
    generationId: generationId || runId || null,
    contextPackage: contextPackage || null,
    approvedSrs: true,
    employeeSnapshot: hasEmployees ? toolData?.employees || container?.resource?.employees || {} : undefined,
    calendarSnapshot: hasCalendar ? toolData?.calendar || scheduleGate?.calendar || true : undefined,
    requiresSatisfied: {
      approvedSrs: true,
      employeeSnapshot: hasEmployees,
      calendarSnapshot: Boolean(hasCalendar),
    },
    scheduleInputGate: scheduleGate,
  };
}

function buildToolInput({
  container,
  pack,
  toolData,
  snapshotId,
  planningHints,
  contextPackage = null,
  toolName = null,
}) {
  // WbsTool: pack + container (SoT stories) only — semantic derived inside tool.
  if (toolName === 'WbsTool') {
    return {
      pack: pack || {},
      snapshotId: snapshotId || null,
      contextPackage: contextPackage || null,
      toolData: {
        enabledProjectRoleKeys: Array.isArray(toolData?.enabledProjectRoleKeys)
          ? toolData.enabledProjectRoleKeys
          : [],
      },
    };
  }

  const hints =
    planningHints ||
    buildPlanningHints(pack || {}, {
      criticalSkillIds: toolData?.merged?.requiredSkillIds || toolData?.filterMeta?.requiredSkillIds,
      domainTokens: toolData?.domainTokens,
      merged: toolData?.merged,
      filterMeta: toolData?.filterMeta,
    });
  return {
    container,
    pack: pack || {},
    toolData: toolData || {},
    snapshotId: snapshotId || null,
    contextPackage: contextPackage || null,
    employees: toolData?.employees || [],
    overview: toolData?.overview || pack?.overview || {},
    calendar: toolData?.calendar,
    meetingHoursByUserDay: toolData?.meetingHoursByUserDay,
    planningHints: hints,
  };
}

module.exports = {
  buildToolContext,
  buildToolInput,
  emptyContainer,
};
