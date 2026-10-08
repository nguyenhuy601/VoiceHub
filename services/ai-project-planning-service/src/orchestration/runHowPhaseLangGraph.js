/**
 * Agent Core F2 — invoke HOW LangGraph and map to phaseOut (parity with JS runHowPhase).
 */

const { buildHowPhaseGraph } = require('./howPhaseGraph');
const {
  resolveAgentBudget,
  STOP_REASONS,
} = require('./agentBudget');
const { buildInitialAgentFields } = require('../checkpoint/agentStateSchema');
const { getLangGraphCheckpointer } = require('./langGraphCheckpointer');

/**
 * @param {object} opts — same shape as runHowPhase in agentLoopRunner
 */
async function runHowPhaseLangGraph({
  container,
  pack,
  toolData,
  snapshot = null,
  snapshotId,
  runId,
  onProgress,
  onCheckpoint,
  resumeState = null,
  selectiveToolNames = null,
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
} = {}) {
  const startedAt = Date.now();
  const isSelective =
    Array.isArray(selectiveToolNames) && selectiveToolNames.length > 0;

  const budget = resolveAgentBudget({
    budget: budgetOverride || resumeState?.budget || undefined,
  });
  const initialFields = buildInitialAgentFields({
    phase: 'how',
    runId,
    snapshotId,
    goal: goalOverride || resumeState?.goal || resumeState?.currentGoal,
    constraints: constraintsOverride || resumeState?.constraints,
    budget,
  });

  let next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { planning: {}, resource: {}, analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;

  const pinnedToolData = toolData && typeof toolData === 'object' ? toolData : {};
  const pinnedPack = pack && typeof pack === 'object' ? pack : {};
  const corpus =
    Array.isArray(resumeState?.corpus) && resumeState.corpus.length
      ? resumeState.corpus
      : [];
  const history = Array.isArray(resumeState?.history) ? [...resumeState.history] : [];
  const toolResults = Array.isArray(resumeState?.toolResults)
    ? [...resumeState.toolResults]
    : [];

  let startIndex = 0;
  if (
    !isSelective &&
    resumeState &&
    typeof resumeState.currentToolIndex === 'number' &&
    resumeState.currentToolIndex > 0
  ) {
    startIndex = resumeState.currentToolIndex;
  }

  const { checkpointer, kind: checkpointerKind } = await getLangGraphCheckpointer();
  const graph = buildHowPhaseGraph({ onProgress, onCheckpoint, checkpointer });
  const threadId = String(runId || snapshotId || `how-${startedAt}`);

  console.info(
    `[agent_core] mode=langgraph runId=${runId || ''} selective=${isSelective} checkpointer=${checkpointerKind}`
  );

  const finalState = await graph.invoke(
    {
      runId,
      snapshotId,
      snapshot,
      pack: pinnedPack,
      toolData: pinnedToolData,
      container: next,
      corpus,
      contextPackage: resumeState?.contextPackage || null,
      history,
      toolResults,
      evaluate: null,
      evaluateAction: null,
      evaluateLoop: 0,
      feasibilitySignal: resumeState?.feasibilitySignal || null,
      feasibility: null,
      goal: initialFields.goal,
      currentGoal: initialFields.currentGoal,
      constraints: initialFields.constraints,
      budget,
      stopReason: resumeState?.stopReason || null,
      selective: isSelective,
      selectiveToolNames: isSelective ? selectiveToolNames : null,
      startIndex,
      currentToolIndex: startIndex,
      currentToolName: null,
      startedAt,
      hitl: 'gate2',
      skipUnderstand: isSelective,
    },
    { configurable: { thread_id: threadId } }
  );

  const durationMs = Math.max(0, Date.now() - startedAt);
  return {
    phase: 'how',
    container: finalState.container,
    history: Array.isArray(finalState.history) ? finalState.history : [],
    toolResults: Array.isArray(finalState.toolResults) ? finalState.toolResults : [],
    contextPackage: finalState.contextPackage || null,
    evaluate: finalState.evaluate || {
      kind: 'evaluate_local',
      enoughInfoToContinue: true,
      reason: 'langgraph_complete',
      action: 'CONTINUE',
    },
    feasibilitySignal: finalState.feasibilitySignal,
    feasibility: finalState.feasibility,
    goal: finalState.goal || initialFields.goal,
    constraints: finalState.constraints || initialFields.constraints,
    budget: finalState.budget || budget,
    stopReason: finalState.stopReason || STOP_REASONS.COMPLETE,
    hitl: 'gate2',
    durationMs,
    selective: isSelective,
    agentCore: 'langgraph',
    checkpointer: checkpointerKind,
  };
}

module.exports = { runHowPhaseLangGraph };
