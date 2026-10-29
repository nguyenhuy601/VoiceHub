/**
 * Graph-owned finalize — not LLM-selectable. Manifest refs only (RULE-PO-05 HITL after).
 */

const {
  runProjectPlanEngine,
  applyProjectPlanToContainer,
} = require('../engines/projectPlan');
const { succeededValidatedTools, latestExecutionByTool } = require('./toolExecutionContract');
const { isHowReadyForFinalize } = require('./computeEligibleHowTools');

function sectionRef(toolName, executions) {
  const row = latestExecutionByTool(executions).get(toolName);
  if (!row || row.status !== 'succeeded' || !row.outputValidated) return null;
  return {
    resultId: row.outputRef || `${toolName}:${row.inputHash}`,
    version: Number(row.attempt) || 1,
    executionId: row.executionId,
    inputHash: row.inputHash,
  };
}

/**
 * @param {object} state
 * @returns {object} state update
 */
function finalizePlanNode(state) {
  const executions = Array.isArray(state.toolExecutions) ? state.toolExecutions : [];
  const done = succeededValidatedTools(state);
  if (!isHowReadyForFinalize(state)) {
    const missing = ['WbsTool', 'DependencyTool', 'ScheduleTool'].filter((n) => !done.has(n));
    return {
      gapReport: {
        missing,
        hint: `finalizePlan blocked — missing validated sections: ${missing.join(', ')}`,
        gapType: 'MISSING_REQUIRED_SECTIONS',
        phase: 'how',
      },
      history: ['finalizePlan:blocked'],
    };
  }

  const container = state.container && typeof state.container === 'object' ? state.container : {};
  const engineResult = runProjectPlanEngine(container);
  const updated = applyProjectPlanToContainer(container, engineResult);

  const planVersion = `pv-${String(state.runId || 'run').slice(-8)}-${Date.now().toString(36)}`;
  const baseManifest = {
    planVersion,
    snapshotId: state.snapshotId || null,
    status: 'ready_for_review',
    sections: {
      wbs: sectionRef('WbsTool', executions),
      dependency: sectionRef('DependencyTool', executions),
      risk: sectionRef('RiskTool', executions),
      quality: sectionRef('QualityPlanTool', executions),
      schedule: sectionRef('ScheduleTool', executions),
    },
    generatedAt: new Date().toISOString(),
  };
  const { enrichPlanManifestWithRevisions } = require('../planningRevision/planManifest');
  const validationRunId =
    state.feasibility?.runId ||
    state.feasibilitySignal?.runId ||
    state.runId ||
    null;
  const manifest = enrichPlanManifestWithRevisions(baseManifest, updated, {
    validationRunId,
  });

  return {
    container: updated,
    planManifest: manifest,
    completeness: {
      ...(state.completeness || {}),
      ready: true,
      readyForGate2: true,
      planManifest: manifest,
    },
    history: [`finalizePlan:${planVersion}`],
  };
}

module.exports = {
  finalizePlanNode,
  sectionRef,
};
