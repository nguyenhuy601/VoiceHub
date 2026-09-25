/**
 * G18 executor — invoke tools and merge artifact containers (phase-only).
 */

const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { applyToolResultToContainer } = require('../tools/applyToolResultToContainer');
const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');

function emptyContainer() {
  return {
    planning: {},
    resource: {},
    analyses: {},
    phaseRuns: {},
  };
}

function buildToolContext({ pack, toolData, container }) {
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

function buildToolInput({ container, pack, toolData, snapshotId }) {
  return {
    container,
    pack: pack || {},
    toolData: toolData || {},
    snapshotId: snapshotId || null,
    employees: toolData?.employees || [],
    overview: toolData?.overview || pack?.overview || {},
    calendar: toolData?.calendar,
    meetingHoursByUserDay: toolData?.meetingHoursByUserDay,
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
  const history = [];
  const toolResults = [];
  const allEvidence = [];

  for (const step of steps) {
    const toolName = step.toolName;
    const stepStarted = Date.now();
    const toolContext = buildToolContext({ pack, toolData, container });
    toolContext.container = container;
    const input = buildToolInput({ container, pack, toolData, snapshotId });
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
