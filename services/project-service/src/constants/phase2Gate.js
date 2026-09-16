/**
 * Phase 1 → Phase 2 (development) readiness gate.
 * Gate v2: completeness + baselines + template required kinds (BPM optional by default).
 */

const { ANALYSIS_ARTIFACT_KINDS } = require('./analysisArtifact');

/** Default required kinds when project.phase1RequiredKinds is empty */
const PHASE1_REQUIRED_KINDS = Object.freeze(['BG', 'BR', 'FR', 'UC', 'NFR', 'SCOPE']);

/** All analysis kinds (BPM optional unless template requires) */
const PHASE1_ALL_KINDS = Object.freeze([...ANALYSIS_ARTIFACT_KINDS]);

const NON_APPROVED_STATUSES = Object.freeze([
  'draft',
  'ba_review',
  'tech_review',
  'pm_review',
  'po_review',
  'rejected',
]);

/**
 * @param {string[]|undefined|null} templateKinds
 * @returns {string[]}
 */
function resolveRequiredKinds(templateKinds) {
  if (Array.isArray(templateKinds) && templateKinds.length) {
    return templateKinds
      .map((k) => String(k || '').trim().toUpperCase())
      .filter((k) => ANALYSIS_ARTIFACT_KINDS.includes(k));
  }
  return [...PHASE1_REQUIRED_KINDS];
}

/**
 * RA readiness (Start Planning) — does not require Planning baseline.
 * @param {{
 *   artifacts?: Array<{ kind?: string, status?: string, isActive?: boolean }>,
 *   criticalGapCount?: number,
 *   requiredKinds?: string[],
 *   deliveryPhase?: string,
 * }} input
 */
function evaluateRaReadiness(input = {}) {
  const blockingReasons = [];
  const requiredKinds = resolveRequiredKinds(input.requiredKinds);
  const artifacts = (Array.isArray(input.artifacts) ? input.artifacts : []).filter(
    (a) => a && a.isActive !== false
  );

  for (const kind of requiredKinds) {
    const ofKind = artifacts.filter((a) => String(a.kind || '').toUpperCase() === kind);
    if (!ofKind.length) {
      blockingReasons.push({ code: `MISSING_KIND_${kind}`, message: `Chưa có artifact ${kind}` });
      continue;
    }
    const approved = ofKind.filter((a) => String(a.status || '').toLowerCase() === 'approved');
    if (!approved.length) {
      blockingReasons.push({
        code: `NO_APPROVED_${kind}`,
        message: `Chưa có ${kind} ở trạng thái approved`,
      });
    }
    const pending = ofKind.filter((a) =>
      NON_APPROVED_STATUSES.includes(String(a.status || '').toLowerCase())
    );
    if (pending.length) {
      blockingReasons.push({
        code: `PENDING_${kind}`,
        message: `${kind} còn ${pending.length} bản chưa approved`,
      });
    }
  }

  const criticalGapCount = Number(input.criticalGapCount) || 0;
  if (criticalGapCount > 0) {
    blockingReasons.push({
      code: 'CRITICAL_GAPS',
      message: `Còn ${criticalGapCount} critical gap`,
    });
  }

  return {
    raApproved: blockingReasons.length === 0,
    blockingReasons,
    requiredKinds,
  };
}

/**
 * Phase 2 readiness — RA + SRS baseline + Planning baseline + no critical gaps.
 * @param {{
 *   artifacts?: Array,
 *   criticalGapCount?: number,
 *   requiredKinds?: string[],
 *   deliveryPhase?: string,
 *   srsBaselineExists?: boolean,
 *   planningBaselineExists?: boolean,
 *   requireBaselines?: boolean,
 * }} input
 */
function evaluateReadyForPhase2(input = {}) {
  const deliveryPhase = String(input.deliveryPhase || '')
    .trim()
    .toLowerCase();
  const blockingReasons = [];

  if (
    deliveryPhase &&
    deliveryPhase !== 'requirement_analysis' &&
    deliveryPhase !== 'delivery_planning'
  ) {
    blockingReasons.push({
      code: 'WRONG_PHASE',
      message: `deliveryPhase=${deliveryPhase} không phải cửa sổ Phase 1`,
    });
  }

  const ra = evaluateRaReadiness(input);
  blockingReasons.push(...ra.blockingReasons);

  const requireBaselines = input.requireBaselines !== false;
  if (requireBaselines) {
    if (!input.srsBaselineExists) {
      blockingReasons.push({
        code: 'NO_SRS_BASELINE',
        message: 'Chưa có SRS Baseline',
      });
    }
    if (!input.planningBaselineExists) {
      blockingReasons.push({
        code: 'NO_PLANNING_BASELINE',
        message: 'Chưa có Planning Baseline',
      });
    }
  }

  return {
    readyForPhase2: blockingReasons.length === 0,
    blockingReasons,
    requiredKinds: ra.requiredKinds,
    raApproved: ra.raApproved,
  };
}

module.exports = {
  PHASE1_REQUIRED_KINDS,
  PHASE1_ALL_KINDS,
  NON_APPROVED_STATUSES,
  resolveRequiredKinds,
  evaluateRaReadiness,
  evaluateReadyForPhase2,
  ANALYSIS_ARTIFACT_KINDS,
};
