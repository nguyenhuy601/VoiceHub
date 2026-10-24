/**
 * RULE-18 — kinds tối thiểu để cắt Planning Baseline.
 * Step 8: optional pack-embed Quality/Deploy plan DoD (no new workbook kinds required).
 */

const { PLANNING_ARTIFACT_KINDS } = require('./planningArtifact');
const {
  evaluateQualityDeployGate,
} = require('../utils/aiAnalysis/qualityDeployPlanGate');

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
 * @returns {{
 *   ok: boolean,
 *   missingRequired: string[],
 *   missingRecommended: string[],
 *   approvedByKind: Record<string, number>,
 *   presentByKind: Record<string, number>,
 *   requiredDraftOnly: string[],
 *   requiredAbsent: string[],
 * }}
 */
function evaluatePlanningBaselineReadiness(artifacts = [], opts = {}) {
  const allActive = (Array.isArray(artifacts) ? artifacts : []).filter(
    (a) => a && a.isActive !== false
  );
  const approvedRows = allActive.filter(
    (a) => String(a.status || '').toLowerCase() === 'approved'
  );

  const approvedByKind = {};
  const presentByKind = {};
  for (const k of PLANNING_ARTIFACT_KINDS) {
    approvedByKind[k] = 0;
    presentByKind[k] = 0;
  }
  for (const a of allActive) {
    const k = String(a.kind || '')
      .trim()
      .toUpperCase();
    if (presentByKind[k] != null) presentByKind[k] += 1;
  }
  for (const a of approvedRows) {
    const k = String(a.kind || '')
      .trim()
      .toUpperCase();
    if (approvedByKind[k] != null) approvedByKind[k] += 1;
  }

  const missingRequired = PLANNING_BASELINE_REQUIRED_KINDS.filter((k) => !approvedByKind[k]);
  const missingRecommended = PLANNING_BASELINE_RECOMMENDED_KINDS.filter((k) => !approvedByKind[k]);
  const requiredDraftOnly = missingRequired.filter((k) => presentByKind[k] > 0);
  const requiredAbsent = missingRequired.filter((k) => !presentByKind[k]);
  const requireRecommended = opts.requireRecommended === true;
  const ok = missingRequired.length === 0 && (!requireRecommended || missingRecommended.length === 0);

  return {
    ok,
    missingRequired,
    missingRecommended,
    approvedByKind,
    presentByKind,
    requiredDraftOnly,
    requiredAbsent,
  };
}

/**
 * Step 8 — when HOW pack is present, require qualityPlan structural OK.
 * Deploy plan is not required (section is outside the HOW tool → LLM flow).
 * (embed in aiAnalysis — not workbook kinds). Override via forceApprove + notes at cut.
 *
 * @param {object|null|undefined} packAiAnalysis
 * @returns {{
 *   ok: boolean,
 *   enforce: boolean,
 *   qualityPlanOk: boolean,
 *   deployPlanOk: boolean,
 *   failures: Array,
 *   counts: object,
 * }}
 */
function evaluatePackQualityDeployForBaseline(packAiAnalysis) {
  const gate = evaluateQualityDeployGate(
    packAiAnalysis && typeof packAiAnalysis === 'object'
      ? { aiAnalysis: packAiAnalysis }
      : {}
  );
  return {
    ok: gate.failures.length === 0,
    enforce: gate.enforce,
    qualityPlanOk: gate.qualityPlanOk,
    deployPlanOk: gate.deployPlanOk,
    failures: gate.failures,
    counts: gate.counts,
  };
}

module.exports = {
  PLANNING_BASELINE_REQUIRED_KINDS,
  PLANNING_BASELINE_RECOMMENDED_KINDS,
  evaluatePlanningBaselineReadiness,
  evaluatePackQualityDeployForBaseline,
};
