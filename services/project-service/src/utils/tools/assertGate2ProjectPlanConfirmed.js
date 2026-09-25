/**
 * Gate 2 — human must confirm phase_how before create-project / board materialize.
 * Pure; no Mongo. RULE-PO-04.
 */

const {
  isPhaseHowConfirmed,
  getPhaseHowStatus,
  migrateJobsProjectionToPhaseRuns,
} = require('../aiAnalysis/phaseGate2');
const { ensureAiAnalysisContainer } = require('../aiAnalysis/aiAnalysisContainer');

/**
 * @param {object} pack — RequirementPack lean/doc
 * @throws {{ statusCode: number, errorCode: string }}
 */
function assertGate2ProjectPlanConfirmed(pack) {
  const raw = pack?.aiAnalysis;
  const container = migrateJobsProjectionToPhaseRuns(
    ensureAiAnalysisContainer(raw && typeof raw === 'object' ? raw : {})
  );
  if (!isPhaseHowConfirmed(container)) {
    const status = getPhaseHowStatus(container);
    const err = new Error(
      'Gate 2: phase_how must be confirmed before creating the project board'
    );
    err.statusCode = 409;
    err.errorCode = 'GATE2_PROJECT_PLAN_REQUIRED';
    err.details = { phase_how: status, projectPlan: status };
    throw err;
  }
  return { ok: true, phase_how: 'confirmed', projectPlan: 'confirmed' };
}

/** Alias — preferred name */
const assertGate2PhaseHowConfirmed = assertGate2ProjectPlanConfirmed;

module.exports = {
  assertGate2ProjectPlanConfirmed,
  assertGate2PhaseHowConfirmed,
};
