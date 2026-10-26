/**
 * WHAT phase entry — invoke whatPhaseGraph and map the final state to phaseOut.
 */

const { runPhaseOrchestrator } = require('./phaseOrchestratorGraph');
const {
  resolveAgentBudget,
  STOP_REASONS,
} = require('./agentBudget');
const { buildInitialAgentFields } = require('../checkpoint/agentStateSchema');
const { getLangGraphCheckpointer } = require('./langGraphCheckpointer');
const {
  createWhatTiming,
  markStage,
  logWhatTiming,
} = require('./whatTiming');
const { preparePhaseSnapshot } = require('./preparePhaseSnapshot');

async function runWhatPhaseLangGraph({
  container,
  pack = {},
  snapshot = null,
  snapshotId = null,
  runId = null,
  onProgress = null,
  onCheckpoint = null,
  frOpts = {},
  g4Opts = null,
  budget: budgetOverride = null,
  goal: goalOverride = null,
  constraints: constraintsOverride = null,
  hydrateMs = null,
  timingRound = null,
  skipUnderstand = false,
  humanFeedback = null,
  parentRunId = null,
  generationId = null,
  decideToolCalls = null,
} = {}) {
  const resolvedFrOpts = {
    ...(g4Opts && typeof g4Opts === 'object' ? g4Opts : {}),
    ...(frOpts && typeof frOpts === 'object' ? frOpts : {}),
  };
  const startedAt = Date.now();
  const prepared = preparePhaseSnapshot({
    snapshotId,
    snapshot,
    runId,
    phase: 'what',
    pack,
  });
  const boundSnapshot = prepared.snapshot;
  const boundSnapshotId = prepared.snapshotId;

  const budget = resolveAgentBudget({ budget: budgetOverride || undefined });
  const initialFields = buildInitialAgentFields({
    phase: 'what',
    runId,
    snapshotId: boundSnapshotId,
    goal: goalOverride,
    constraints: constraintsOverride,
    budget,
  });

  const next =
    container && typeof container === 'object' && !Array.isArray(container)
      ? structuredClone(container)
      : { analyses: {}, phaseRuns: {} };
  if (next.jobs != null) delete next.jobs;

  let whatTiming = createWhatTiming({
    round: timingRound != null ? timingRound : process.env.WHAT_TIMING_ROUND || 0,
    packId: pack?._id || pack?.id || null,
    snapshotId: boundSnapshotId,
    runId,
  });
  if (hydrateMs != null && Number.isFinite(Number(hydrateMs))) {
    whatTiming = markStage(whatTiming, 'hydrate', { ms: Number(hydrateMs) });
  }

  const { checkpointer, kind: checkpointerKind } = await getLangGraphCheckpointer();
  const { assertDurableCheckpointerForInRunHitl } = require('./hitlCheckpointerPolicy');
  assertDurableCheckpointerForInRunHitl({ kind: checkpointerKind });
  const threadId = String(runId || boundSnapshotId || `what-${startedAt}`);

  console.info(
    `[agent_core] mode=langgraph_react phase=what runId=${runId || ''} checkpointer=${checkpointerKind}`
  );

  const finalState = await runPhaseOrchestrator({
    phase: 'what',
    threadId,
    hooks: { onProgress, onCheckpoint, checkpointer, decideToolCalls },
    input: {
      runId,
      snapshotId: boundSnapshotId,
      snapshot: boundSnapshot,
      pack,
      container: next,
      corpus: [],
      contextPackage: null,
      history: [],
      toolResults: [],
      messages: humanFeedback
        ? [{ role: 'user', content: JSON.stringify(humanFeedback).slice(0, 2000) }]
        : [],
      frUnderstanding: null,
      proposalFragment: null,
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
      frOpts: resolvedFrOpts,
      env: process.env,
      whatTiming,
      skipUnderstand: Boolean(skipUnderstand),
      srsProposal: next?.analyses?.srsProposal || null,
      engineResultsById: {},
      semanticStatuses: {},
      agentIteration: 0,
      enrichLoop: 0,
      gapReport: null,
      completeness: null,
    },
  });

  const durationMs = Math.max(0, Date.now() - startedAt);
  const timing = logWhatTiming(finalState.whatTiming || whatTiming, { totalMs: durationMs });

  return {
    phase: 'what',
    container: finalState.container,
    history: Array.isArray(finalState.history) ? finalState.history : [],
    toolResults: Array.isArray(finalState.toolResults) ? finalState.toolResults : [],
    contextPackage: finalState.contextPackage || null,
    frUnderstanding: finalState.frUnderstanding,
    proposalFragment: finalState.proposalFragment || null,
    srsProposal: finalState.srsProposal || null,
    evaluate: finalState.evaluate,
    feasibilitySignal: finalState.feasibilitySignal,
    feasibility: finalState.feasibility,
    goal: finalState.goal || initialFields.goal,
    constraints: finalState.constraints || initialFields.constraints,
    budget: finalState.budget || budget,
    stopReason: finalState.stopReason || STOP_REASONS.COMPLETE,
    hitl: 'gate1',
    paused: false,
    gate: null,
    gatePreview: null,
    partial: null,
    durationMs,
    whatTiming: timing,
    stub: false,
    agentCore: 'langgraph_react',
    checkpointer: checkpointerKind,
    parentRunId,
    generationId,
  };
}

module.exports = { runWhatPhaseLangGraph };
