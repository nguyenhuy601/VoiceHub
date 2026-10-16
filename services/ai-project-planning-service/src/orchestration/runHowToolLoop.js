/**
 * HOW tool loop with seek (RULE-SEEK-01) — DAG layers + parallel independent tools.
 * Track B: budget/timeout/stop checked before each layer (≠ LangGraph F2).
 */

const { invokeTool } = require('../registry/toolRegistry');
const { registerDefaultTools } = require('../tools/registerDefaultTools');
const { applyToolResultToContainer } = require('../tools/applyToolResultToContainer');
const { mergeParallelToolContainers } = require('../tools/mergePlanningContainers');
const {
  buildToolContext,
  buildToolInput,
  emptyContainer,
} = require('./runToolsSequence');
const { HOW_PHASE_TOOL_STEPS, resolveStepsForToolNames } = require('./jobToToolsMap');
const { buildHowToolStepLayers } = require('./howToolDag');
const { assertToolOutputHasEvidence } = require('../evidence/evidence');
const {
  resolveAgentBudget,
  evaluateStopCondition,
} = require('./agentBudget');

/**
 * @param {object} opts
 * @param {Array<{ toolName: string }>} [opts.steps]
 * @param {number} [opts.startIndex] — resume seek (0-based inclusive in flat steps)
 * @param {object} [opts.container]
 * @param {object} [opts.pack]
 * @param {object} [opts.toolData]
 * @param {string|null} [opts.snapshotId]
 * @param {(info: object) => Promise<void>|void} [opts.onToolStart]
 * @param {(info: object) => Promise<void>|void} [opts.onToolDone]
 * @param {object} [opts.budget]
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

  const remainingSteps = steps
    .map((step, stepIndex) => ({ ...step, stepIndex }))
    .filter((s) => s.stepIndex >= startIndex);

  const layers = buildHowToolStepLayers(remainingSteps);

  const history = [];
  const toolResults = [];
  const allEvidence = [];
  let stopReason = null;
  let baseIteration = Math.max(0, Number(opts.baseIteration) || 0);
  let completedThroughIndex = startIndex;

  for (const layer of layers) {
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

    const layerNames = layer.map((s) => s.toolName);
    console.info(
      `[how_seek] layer=${layerNames.join('|')} parallel=${layer.length}`
    );

    const layerBase = container;

    await Promise.all(
      layer.map(async (step) => {
        if (typeof opts.onToolStart === 'function') {
          await opts.onToolStart({
            index: step.stepIndex,
            toolName: step.toolName,
            layerToolNames: layerNames,
          });
        }
      })
    );

    const settled = await Promise.all(
      layer.map(async (step) => {
        const toolName = step.toolName;
        const stepStarted = Date.now();
        const toolContext = buildToolContext({
          pack,
          toolData,
          container: layerBase,
          runId: opts.runId || null,
          generationId: opts.generationId || opts.runId || null,
        });
        toolContext.container = layerBase;
        const input = buildToolInput({
          container: layerBase,
          pack,
          toolData,
          snapshotId,
        });
        const toolOut = await invokeTool(toolName, input, toolContext);
        assertToolOutputHasEvidence(toolName, toolOut);
        const durationMs = Math.max(0, Date.now() - stepStarted);
        return {
          step,
          toolName,
          toolOut,
          durationMs,
          patchContainer:
            toolOut?.result?.container && typeof toolOut.result.container === 'object'
              ? toolOut.result.container
              : null,
        };
      })
    );

    // Deterministic merge order = canonical stepIndex
    settled.sort((a, b) => a.step.stepIndex - b.step.stepIndex);

    if (settled.length === 1) {
      container = applyToolResultToContainer(layerBase, settled[0].toolOut);
    } else {
      container = mergeParallelToolContainers(
        layerBase,
        settled.map((s) => s.patchContainer)
      );
    }

    for (const item of settled) {
      if (Array.isArray(item.toolOut?.evidence)) {
        allEvidence.push(...item.toolOut.evidence);
      }
      toolResults.push({ toolName: item.toolName, durationMs: item.durationMs });
      history.push(`execute:${item.toolName}`);
      completedThroughIndex = Math.max(completedThroughIndex, item.step.stepIndex + 1);
    }

    if (typeof opts.onToolDone === 'function') {
      const last = settled[settled.length - 1];
      await opts.onToolDone({
        index: last.step.stepIndex,
        nextIndex: completedThroughIndex,
        toolName: last.toolName,
        toolNames: settled.map((s) => s.toolName),
        layerToolNames: layerNames,
        container,
        toolResults: [...toolResults],
        history: [...history],
        done: completedThroughIndex >= steps.length,
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
      executedVia: 'g18_tool_loop_dag',
      startIndex,
      stepsTotal: steps.length,
      layerCount: layers.length,
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
