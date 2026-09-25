/**
 * HOW tool loop with seek (RULE-SEEK-01) — primitive used by agentLoopRunner.
 * Track B: budget/timeout/stop checked before each tool (≠ LangGraph F2).
 */

const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { applyToolResultToContainer } = require('../tools/applyToolResultToContainer');
const {
  buildToolContext,
  buildToolInput,
  emptyContainer,
} = require('./runToolsSequence');
const { HOW_PHASE_TOOL_STEPS, resolveStepsForToolNames } = require('./jobToToolsMap');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');
const {
  resolveAgentBudget,
  evaluateStopCondition,
} = require('./agentBudget');

/**
 * @param {object} opts
 * @param {Array<{ toolName: string }>} [opts.steps]
 * @param {number} [opts.startIndex] — resume seek (0-based inclusive)
 * @param {object} [opts.container]
 * @param {object} [opts.pack]
 * @param {object} [opts.toolData]
 * @param {string|null} [opts.snapshotId]
 * @param {(info: object) => Promise<void>|void} [opts.onToolDone]
 * @param {object} [opts.budget] — Track B override
 * @param {number} [opts.startedAt]
 * @param {number} [opts.baseIteration]
 */
async function runHowToolLoop(opts = {}) {
  registerDefaultTools();
  const startedAt =
    typeof opts.startedAt === 'number' && Number.isFinite(opts.startedAt)
      ? opts.startedAt
      : Date.now();
  const budget = resolveAgentBudget({ budget: opts.budget });
  let container =
    opts.container && typeof opts.container === 'object' && !Array.isArray(opts.container)
      ? structuredClone(opts.container)
      : emptyContainer();
  if (container.jobs != null) delete container.jobs;

  const pack = opts.pack || {};
  const toolData = opts.toolData || {};
  const snapshotId = opts.snapshotId || null;
  const steps = Array.isArray(opts.steps) && opts.steps.length
    ? opts.steps
    : [...HOW_PHASE_TOOL_STEPS];

  let startIndex = Number(opts.startIndex);
  if (!Number.isFinite(startIndex) || startIndex < 0) startIndex = 0;
  startIndex = Math.min(startIndex, steps.length);

  const history = [];
  const toolResults = [];
  const allEvidence = [];
  let stopReason = null;
  let baseIteration = Math.max(0, Number(opts.baseIteration) || 0);

  for (let i = startIndex; i < steps.length; i += 1) {
    const stop = evaluateStopCondition({
      budget,
      startedAt,
      iteration: baseIteration + history.length,
      toolCallCount: toolResults.length,
    });
    if (stop.stop) {
      stopReason = stop.reason;
      history.push(`stop:${stop.reason}`);
      break;
    }

    const step = steps[i];
    const toolName = step.toolName;
    console.info(`[how_seek] tool=${toolName} index=${i}/${steps.length}`);
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

    if (typeof opts.onToolDone === 'function') {
      await opts.onToolDone({
        index: i,
        nextIndex: i + 1,
        toolName,
        container,
        toolResults: [...toolResults],
        history: [...history],
        done: i + 1 >= steps.length,
        stopReason: null,
      });
    }
  }

  return {
    container,
    toolResults,
    history,
    evidence: allEvidence,
    stopReason,
    budget,
    meta: {
      durationMs: Math.max(0, Date.now() - startedAt),
      executedVia: 'g18_tool_loop',
      startIndex,
      stepsTotal: steps.length,
      llmCalls: 0,
      stoppedEarly: Boolean(stopReason),
    },
  };
}

/**
 * Resolve steps for full HOW or selective tool names.
 * @param {string[]|null|undefined} selectiveToolNames
 */
function resolveHowSteps(selectiveToolNames) {
  if (Array.isArray(selectiveToolNames) && selectiveToolNames.length) {
    const steps = resolveStepsForToolNames(selectiveToolNames);
    return steps.length ? steps : [...HOW_PHASE_TOOL_STEPS];
  }
  return [...HOW_PHASE_TOOL_STEPS];
}

module.exports = {
  runHowToolLoop,
  resolveHowSteps,
};
