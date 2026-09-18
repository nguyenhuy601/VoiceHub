/**
 * RULE-18 — kinds tối thiểu để cắt Planning Baseline.
 */

const { PLANNING_ARTIFACT_KINDS } = require('./planningArtifact');

/** Bắt buộc có ≥1 artifact approved cho mỗi kind. */
const PLANNING_BASELINE_REQUIRED_KINDS = Object.freeze([
  'WBS',
  'SCHEDULE',
  'MILESTONE',
  'RESOURCE',
  'RISK',
]);

/** Khuyến nghị — thiếu → warning, không block cut (trừ khi requireRecommended=true). */
const PLANNING_BASELINE_RECOMMENDED_KINDS = Object.freeze([
  'ARCHITECTURE',
  'RELEASE',
  'DEPENDENCY',
]);

/**
 * @param {Array<{ kind?: string, status?: string, isActive?: boolean }>} artifacts
 * @param {{ requireRecommended?: boolean }} [opts]
 * @returns {{ ok: boolean, missingRequired: string[], missingRecommended: string[], approvedByKind: Record<string, number> }}
 */
function evaluatePlanningBaselineReadiness(artifacts = [], opts = {}) {
  const rows = (Array.isArray(artifacts) ? artifacts : []).filter(
    (a) => a && a.isActive !== false && String(a.status || '').toLowerCase() === 'approved'
  );
  const approvedByKind = {};
  for (const k of PLANNING_ARTIFACT_KINDS) {
    approvedByKind[k] = 0;
  }
  for (const a of rows) {
    const k = String(a.kind || '')
      .trim()
      .toUpperCase();
    if (approvedByKind[k] != null) approvedByKind[k] += 1;
  }

  const missingRequired = PLANNING_BASELINE_REQUIRED_KINDS.filter((k) => !approvedByKind[k]);
  const missingRecommended = PLANNING_BASELINE_RECOMMENDED_KINDS.filter((k) => !approvedByKind[k]);
  const requireRecommended = opts.requireRecommended === true;
  const ok = missingRequired.length === 0 && (!requireRecommended || missingRecommended.length === 0);

  return {
    ok,
    missingRequired,
    missingRecommended,
    approvedByKind,
  };
}

module.exports = {
  PLANNING_BASELINE_REQUIRED_KINDS,
  PLANNING_BASELINE_RECOMMENDED_KINDS,
  evaluatePlanningBaselineReadiness,
};
