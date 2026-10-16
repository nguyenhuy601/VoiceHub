const { createEvidence } = require('../evidence/evidence');

/**
 * G13 Automated Feasibility — whole-plan validator (≠ G8 Evaluate).
 * G8 = "enough info to continue?"; G13 = "is the plan feasible?"
 *
 * Track C: `confidence` / `confidenceScore` on planState MUST NOT flip pass.
 * Pass is derived only from deterministic flags (+ evidence refs for audit).
 *
 * @param {object} planState
 * @returns {{ pass: boolean, failures: Array, evidenceRefs: string[], evidence: object[] }}
 */
function checkFeasibility(planState = {}) {
  const failures = [];
  const evidence = [];
  const snapshotId = planState.snapshotId || null;

  // Strip confidence so callers cannot smuggle pass via LLM score
  const {
    confidence: _c,
    confidenceScore: _cs,
    ragConfidence: _rc,
    ...flagsSource
  } = planState;

  const coverageOk =
    flagsSource.coverageOk !== false && flagsSource.flags?.coverage !== false;
  const resourceOk =
    flagsSource.resourceOk !== false && flagsSource.flags?.resource !== false;
  const scheduleOk =
    flagsSource.scheduleOk !== false && flagsSource.flags?.schedule !== false;
  const architectureOk =
    flagsSource.architectureOk !== false && flagsSource.flags?.architecture !== false;
  const riskOk = flagsSource.riskOk !== false && flagsSource.flags?.risk !== false;
  const qualityPlanOk =
    flagsSource.qualityPlanOk !== false && flagsSource.flags?.quality !== false;
  const deployPlanOk =
    flagsSource.deployPlanOk !== false && flagsSource.flags?.deploy !== false;

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
  if (!qualityPlanOk) {
    failures.push({
      code: 'FEAS_QUALITY_PLAN',
      message: 'Quality/testing plan incomplete (need levels + AC/catalog coverage)',
    });
  }
  if (!deployPlanOk) {
    failures.push({
      code: 'FEAS_DEPLOY_PLAN',
      message:
        'Deploy plan incomplete (need envMatrix ≥2 or TBD, rollback steps, release mode, outOfScopeInApp)',
    });
  }

  const pass = failures.length === 0;

  const ev = createEvidence({
    sourceType: 'feasibility_check',
    sourceId: planState.runId || 'plan',
    snapshotId,
    metric: 'feasibility_pass',
    value: pass,
    unit: 'boolean',
    calculatedBy: 'FeasibilityValidator',
    ruleId: 'G13-FEAS',
  });
  evidence.push(ev);

  return {
    pass,
    failures,
    evidenceRefs: evidence.map((e) => e.evidenceId),
    evidence,
    // Audit: any confidence on input was ignored
    confidenceIgnored: _c != null || _cs != null || _rc != null,
  };
}

module.exports = { checkFeasibility };
