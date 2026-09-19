const { createEvidence } = require('../evidence/evidence');

/**
 * G13 Automated Feasibility — whole-plan validator (≠ G8 Evaluate).
 * G8 = "enough info to continue?"; G13 = "is the plan feasible?"
 *
 * @param {object} planState
 * @returns {{ pass: boolean, failures: Array, evidenceRefs: string[] }}
 */
function checkFeasibility(planState = {}) {
  const failures = [];
  const evidence = [];
  const snapshotId = planState.snapshotId || null;

  const coverageOk = planState.coverageOk !== false && planState.flags?.coverage !== false;
  const resourceOk = planState.resourceOk !== false && planState.flags?.resource !== false;
  const scheduleOk = planState.scheduleOk !== false && planState.flags?.schedule !== false;
  const architectureOk =
    planState.architectureOk !== false && planState.flags?.architecture !== false;
  const riskOk = planState.riskOk !== false && planState.flags?.risk !== false;

  if (!coverageOk) {
    failures.push({ code: 'FEAS_COVERAGE', message: 'FR coverage incomplete' });
  }
  if (!resourceOk) {
    failures.push({ code: 'FEAS_RESOURCE', message: 'Resource capacity insufficient' });
  }
  if (!scheduleOk) {
    failures.push({ code: 'FEAS_SCHEDULE', message: 'Schedule/deps/deadline conflict' });
  }
  if (!architectureOk) {
    failures.push({ code: 'FEAS_ARCHITECTURE', message: 'Architecture constraints violated' });
  }
  if (!riskOk) {
    failures.push({ code: 'FEAS_RISK', message: 'Risk threshold exceeded' });
  }

  const ev = createEvidence({
    sourceType: 'feasibility_check',
    sourceId: planState.runId || 'plan',
    snapshotId,
    metric: 'feasibility_pass',
    value: failures.length === 0,
    unit: 'boolean',
    calculatedBy: 'FeasibilityValidator',
    ruleId: 'G13-FEAS',
  });
  evidence.push(ev);

  return {
    pass: failures.length === 0,
    failures,
    evidenceRefs: evidence.map((e) => e.evidenceId),
    evidence,
  };
}

module.exports = { checkFeasibility };
