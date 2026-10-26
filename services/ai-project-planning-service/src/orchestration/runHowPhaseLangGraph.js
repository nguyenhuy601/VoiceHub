/**
 * HOW phase entry — invoke howPhaseGraph and map the final state to phaseOut.
 */

const { runPhaseOrchestrator } = require('./phaseOrchestratorGraph');
const {
  resolveAgentBudget,
  STOP_REASONS,
} = require('./agentBudget');
const { buildInitialAgentFields } = require('../checkpoint/agentStateSchema');
const { getLangGraphCheckpointer } = require('./langGraphCheckpointer');
const { preparePhaseSnapshot } = require('./preparePhaseSnapshot');

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
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
  decideToolCalls = null,
} = {}) {
  const startedAt = Date.now();
  const prepared = preparePhaseSnapshot({
    snapshotId,
    snapshot,
    runId,
    phase: 'how',
    pack: pack || {},
  });
  const boundSnapshot = prepared.snapshot;
  const boundSnapshotId = prepared.snapshotId;

  const budget = resolveAgentBudget({
    budget: budgetOverride || resumeState?.budget || undefined,
  });
  const initialFields = buildInitialAgentFields({
    phase: 'how',
    runId,
    snapshotId: boundSnapshotId,
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

  const { checkpointer, kind: checkpointerKind } = await getLangGraphCheckpointer();
  const { assertDurableCheckpointerForInRunHitl } = require('./hitlCheckpointerPolicy');
  assertDurableCheckpointerForInRunHitl({ kind: checkpointerKind });
  const threadId = String(runId || boundSnapshotId || `how-${startedAt}`);

  console.info(
    `[agent_core] mode=langgraph_react phase=how runId=${runId || ''} checkpointer=${checkpointerKind}`
  );

  const finalState = await runPhaseOrchestrator({
    phase: 'how',
    threadId,
    hooks: { onProgress, onCheckpoint, checkpointer, decideToolCalls },
    input: {
      runId,
      snapshotId: boundSnapshotId,
      snapshot: boundSnapshot,
      pack: pinnedPack,
      toolData: pinnedToolData,
      container: next,
      corpus,
      contextPackage: resumeState?.contextPackage || null,
      history,
      toolResults,
      messages: [],
      evaluate: null,
      feasibilitySignal: resumeState?.feasibilitySignal || null,
      feasibility: null,
      goal: initialFields.goal,
      currentGoal: initialFields.currentGoal,
      constraints: initialFields.constraints,
      budget,
      stopReason: resumeState?.stopReason || null,
      startedAt,
      hitl: 'gate2',
      skipUnderstand: Boolean(resumeState?.skipUnderstand),
      agentIteration: 0,
      enrichLoop: 0,
      gapReport: null,
      completeness: null,
      generationId: runId || null,
    },
  });

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
    agentCore: 'langgraph_react',
    checkpointer: checkpointerKind,
  };
}

module.exports = { runHowPhaseLangGraph };
