/**
 * G18 executor — invoke tools and merge artifact containers (phase-only).
 */

const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { applyToolResultToContainer } = require('../tools/applyToolResultToContainer');
const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');
const { buildPlanningHints } = require('./buildPlanningHints');

function emptyContainer() {
  return {
    planning: {},
    resource: {},
    analyses: {},
    phaseRuns: {},
  };
}

function buildToolContext({ pack, toolData, container, runId, generationId }) {
  const hasEmployees =
    Array.isArray(toolData?.employees) ||
    Array.isArray(container?.resource?.employees);
  // Calendar snapshot present when explicit calendar OR project startDate (RULE-AUD-03)
  const hasCalendar =
    toolData?.calendar != null || pack?.overview?.startDate != null;

  return {
    contextName: 'planning',
    pack: pack || {},
    container,
    runId: runId || null,
    generationId: generationId || runId || null,
    approvedSrs: true,
    employeeSnapshot: hasEmployees ? toolData?.employees || container?.resource?.employees || {} : undefined,
    calendarSnapshot: hasCalendar ? toolData?.calendar || true : undefined,
    requiresSatisfied: {
      approvedSrs: true,
      employeeSnapshot: hasEmployees,
      calendarSnapshot: hasCalendar,
    },
  };
}

function buildToolInput({ container, pack, toolData, snapshotId, planningHints }) {
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
    employees: toolData?.employees || [],
    overview: toolData?.overview || pack?.overview || {},
    calendar: toolData?.calendar,
    meetingHoursByUserDay: toolData?.meetingHoursByUserDay,
    planningHints: hints,
  };
}

/**
 * @param {Array<{ toolName: string, autoConfirm?: boolean }>} steps
 * @param {object} ctx
 */
async function runToolsSequence(steps, ctx = {}) {
  registerDefaultTools();
  const startedAt = Date.now();
  let container =
    ctx.container && typeof ctx.container === 'object' && !Array.isArray(ctx.container)
      ? structuredClone(ctx.container)
      : emptyContainer();
  if (container.jobs != null) delete container.jobs;

  const pack = ctx.pack || {};
  const toolData = ctx.toolData || {};
  const snapshotId = ctx.snapshotId || null;
  const planningHints =
    ctx.planningHints ||
    buildPlanningHints(pack, {
      criticalSkillIds: toolData?.merged?.requiredSkillIds || toolData?.filterMeta?.requiredSkillIds,
      domainTokens: toolData?.domainTokens,
      merged: toolData?.merged,
      filterMeta: toolData?.filterMeta,
    });
  const history = [];
  const toolResults = [];
  const allEvidence = [];

  for (const step of steps) {
    const toolName = step.toolName;
    const stepStarted = Date.now();
    const toolContext = buildToolContext({ pack, toolData, container });
    toolContext.container = container;
    toolContext.planningHints = planningHints;
    const input = buildToolInput({
      container,
      pack,
      toolData,
      snapshotId,
      planningHints,
    });
    const toolOut = await invokeTool(toolName, input, toolContext);
    assertToolOutputHasEvidence(toolName, toolOut);
    const durationMs = Math.max(0, Date.now() - stepStarted);
    container = applyToolResultToContainer(container, toolOut);
    if (Array.isArray(toolOut?.evidence)) {
      allEvidence.push(...toolOut.evidence);
    }
    toolResults.push({ toolName, durationMs });
    history.push(`execute:${toolName}`);
  }

  const durationMs = Math.max(0, Date.now() - startedAt);
  return {
    container,
    toolResults,
    history,
    evidence: allEvidence,
    meta: { durationMs, executedVia: 'g18', llmCalls: 0 },
  };
}

async function runHowPhaseTools(ctx = {}) {
  return runToolsSequence(HOW_PHASE_TOOL_STEPS, ctx);
}

module.exports = {
  runToolsSequence,
  runHowPhaseTools,
  buildToolContext,
  buildToolInput,
  emptyContainer,
};
