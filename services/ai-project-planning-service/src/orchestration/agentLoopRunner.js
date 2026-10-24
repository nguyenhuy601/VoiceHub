/**
 * Phase entry. WHAT and HOW share one orchestrator LangGraph
 * (`phaseOrchestratorGraph`). The phase field selects the branch.
 * That branch calls tools. There is no JS phase state machine.
 */

const { HOW_PHASE_TOOL_STEPS } = require('./jobToToolsMap');
const { normalizeGenerationId } = require('../contracts/runLineageContract');

const PHASE_HOW = 'how';
const PHASE_WHAT = 'what';

/** HOW tool names in execute order (phase-only). */
const HOW_PHASE_TOOL_NAMES = Object.freeze(
  HOW_PHASE_TOOL_STEPS.map((s) => s.toolName)
);

/**
 * @param {object} opts
 * @param {'how'|'what'} opts.phase
 * @param {object} [opts.resumeState] — G15 checkpoint state (seek / pin)
 * @param {string[]} [opts.selectiveToolNames] — RULE-SEL-01
 */
async function runAgentPhase({
  phase,
  container,
  pack = {},
  toolData = {},
  snapshot = null,
  snapshotId = null,
  runId = null,
  onProgress = null,
  onCheckpoint = null,
  g4Opts = {},
  resumeState = null,
  selectiveToolNames = null,
  budget = null,
  goal = null,
  constraints = null,
  humanFeedback = null,
  parentRunId = null,
  generationId = null,
} = {}) {
  const { assertSnapshotBoundary } = require('../knowledge/assertSnapshotBoundary');
  const bound = assertSnapshotBoundary({
    snapshotId,
    snapshot,
    runId,
    phase,
  });

  let boundSnapshot = bound.snapshot;
  try {
    const { attachG1Catalogs } = require('../knowledge/attachG1Catalogs');
    const attachInput = {
      ...boundSnapshot,
      pack,
      staffingPlan: boundSnapshot.staffingPlan || pack?.staffingPlan,
      requirementSkills:
        boundSnapshot.requirementSkills || pack?.requirementSkills,
    };
    boundSnapshot = attachG1Catalogs(attachInput).snapshot;
  } catch {
    /* keep boundary snapshot */
  }

  const p = String(phase || '').trim().toLowerCase();
  if (p === PHASE_HOW || p === 'phase_how') {
    const { runHowPhaseLangGraph } = require('./runHowPhaseLangGraph');
    return runHowPhaseLangGraph({
      container: resumeState?.container || container,
      pack: resumeState?.pack || pack,
      toolData: resumeState?.toolData || toolData,
      snapshotId: bound.snapshotId,
      runId,
      onProgress,
      onCheckpoint,
      snapshot: boundSnapshot,
      resumeState,
      selectiveToolNames,
      budget,
      goal,
      constraints,
    });
  }
  if (p === PHASE_WHAT || p === 'phase_what') {
    const { runWhatPhaseLangGraph } = require('./runWhatPhaseLangGraph');
    return runWhatPhaseLangGraph({
      container,
      pack,
      snapshot: boundSnapshot,
      snapshotId: bound.snapshotId,
      runId,
      parentRunId,
      generationId: generationId || normalizeGenerationId(runId),
      onProgress,
      onCheckpoint,
      g4Opts,
      budget,
      goal,
      constraints,
      humanFeedback: humanFeedback || null,
    });
  }
  const err = new Error(`Unsupported agent phase: ${phase}`);
  err.code = 'AGENT_PHASE_UNSUPPORTED';
  throw err;
}

module.exports = {
  runAgentPhase,
  HOW_PHASE_TOOL_NAMES,
  /** @deprecated alias — use HOW_PHASE_TOOL_NAMES */
  HOW_PHASE_JOBS: HOW_PHASE_TOOL_NAMES,
  PHASE_HOW,
  PHASE_WHAT,
};
