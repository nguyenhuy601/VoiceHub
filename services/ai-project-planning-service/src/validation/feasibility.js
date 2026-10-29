const { createEvidence } = require('../evidence/evidence');

/** Soft at Gate 2 — still listed for PM HITL, do not flip feasibility.pass / G13 hard-block. */
const SOFT_FEASIBILITY_CODES = new Set([
  'FEAS_RESOURCE',
  'FEAS_SCHEDULE',
  'AC_COVERAGE_GAP',
]);

function asSoftFailure(row, fallbackCode, fallbackMessage) {
  if (row && typeof row === 'object') {
    return {
      ...row,
      code: String(row.code || fallbackCode),
      soft: true,
    };
  }
  return { code: fallbackCode, message: fallbackMessage, soft: true };
}

/**
 * feasibility Automated Feasibility — whole-plan validator (≠ evaluate Evaluate).
 * evaluate = "enough info to continue?"; feasibility = "is the plan feasible?"
 *
 * Track C: `confidence` / `confidenceScore` on planState MUST NOT flip pass.
 * Pass is derived only from deterministic hard flags (+ evidence refs for audit).
 * Soft (ops HITL): FEAS_RESOURCE, FEAS_SCHEDULE, AC_COVERAGE_GAP.
 *
 * @param {object} planState
 * @returns {{ pass: boolean, failures: Array, softFailures: Array, evidenceRefs: string[], evidence: object[] }}
 */
function checkFeasibility(planState = {}) {
  const failures = [];
  const softFailures = [];
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

  if (!coverageOk) {
    const wbsGap =
      flagsSource.wbsCoverageFailure ||
      flagsSource.flags?.wbsCoverageFailure ||
      null;
    softFailures.push(
      asSoftFailure(
        wbsGap,
        'AC_COVERAGE_GAP',
        'WBS AC/FR coverage incomplete — còn AC/Story bắt buộc chưa được Task bao phủ'
      )
    );
  }
  if (!resourceOk) {
    softFailures.push({
      code: 'FEAS_RESOURCE',
      message: 'Resource capacity insufficient',
      soft: true,
    });
  }
  if (!scheduleOk) {
    softFailures.push({
      code: 'FEAS_SCHEDULE',
      message: 'Schedule/deps/deadline conflict',
      soft: true,
    });
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

  // Hard pass only — soft codes stay in failures[] for Gate2 UI / audit.
  const pass = failures.length === 0;
  const allFailures = [...failures, ...softFailures];

  const ev = createEvidence({
    sourceType: 'feasibility_check',
    sourceId: planState.runId || 'plan',
    snapshotId,
    metric: 'feasibility_pass',
    value: pass,
    unit: 'boolean',
    calculatedBy: 'FeasibilityValidator',
    ruleId: 'FEASIBILITY',
  });
  evidence.push(ev);

  return {
    pass,
    failures: allFailures,
    softFailures,
    evidenceRefs: evidence.map((e) => e.evidenceId),
    evidence,
    // Audit: any confidence on input was ignored
    confidenceIgnored: _c != null || _cs != null || _rc != null,
  };
}

module.exports = { checkFeasibility, SOFT_FEASIBILITY_CODES };
