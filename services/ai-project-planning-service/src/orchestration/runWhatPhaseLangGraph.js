/**
 * Agent Core F2 — invoke WHAT LangGraph → phaseOut parity with JS runWhatPhase.
 */

const { buildWhatPhaseGraph } = require('./whatPhaseGraph');
const {
  resolveAgentBudget,
  STOP_REASONS,
} = require('./agentBudget');
const { buildInitialAgentFields } = require('../checkpoint/agentStateSchema');
const { getLangGraphCheckpointer } = require('./langGraphCheckpointer');

async function runWhatPhaseLangGraph({
  container,
  pack = {},
  snapshot = null,
  snapshotId = null,
  runId = null,
  onProgress = null,
  onCheckpoint = null,
  g4Opts = {},
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
} = {}) {
  const startedAt = Date.now();
  const budget = resolveAgentBudget({ budget: budgetOverride || undefined });
  const initialFields = buildInitialAgentFields({
    phase: 'what',
    runId,
    snapshotId,
    goal: goalOverride,
    constraints: constraintsOverride,
    budget,
  });

  const next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;

  const { checkpointer, kind: checkpointerKind } = await getLangGraphCheckpointer();
  const graph = buildWhatPhaseGraph({ onProgress, onCheckpoint, checkpointer });
  const threadId = String(runId || snapshotId || `what-${startedAt}`);

  console.info(
    `[agent_core] mode=langgraph phase=what runId=${runId || ''} checkpointer=${checkpointerKind}`
  );

  const finalState = await graph.invoke(
    {
      runId,
      snapshotId,
      snapshot,
      pack,
      container: next,
      corpus: [],
      contextPackage: null,
      history: [],
      toolResults: [],
      g4Understanding: null,
      conflictAmbiguityGate: null,
      evaluate: null,
      feasibilitySignal: null,
      feasibility: null,
      goal: initialFields.goal,
      currentGoal: initialFields.currentGoal,
      constraints: initialFields.constraints,
      budget,
      stopReason: null,
      startedAt,
      hitl: 'gate1',
      g4Opts,
    },
    { configurable: { thread_id: threadId } }
  );

  return {
    phase: 'what',
    container: finalState.container,
    history: Array.isArray(finalState.history) ? finalState.history : [],
    toolResults: Array.isArray(finalState.toolResults) ? finalState.toolResults : [],
    contextPackage: finalState.contextPackage || null,
    g4Understanding: finalState.g4Understanding,
    evaluate: finalState.evaluate,
    feasibilitySignal: finalState.feasibilitySignal,
    feasibility: finalState.feasibility,
    goal: finalState.goal || initialFields.goal,
    constraints: finalState.constraints || initialFields.constraints,
    budget: finalState.budget || budget,
    stopReason: finalState.stopReason || STOP_REASONS.COMPLETE,
    hitl: 'gate1',
    durationMs: Math.max(0, Date.now() - startedAt),
    stub: false,
    agentCore: 'langgraph',
    checkpointer: checkpointerKind,
  };
}

module.exports = { runWhatPhaseLangGraph };
