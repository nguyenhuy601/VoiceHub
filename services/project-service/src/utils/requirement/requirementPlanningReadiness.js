/**
 * Requirement pack readiness — WHAT-only gate (W1).
 * Analysis/submit = 0 validation errors. No FR Role/Skill/Hours enforce.
 * (Legacy AI Planning staffing overlay removed — gate still used by AI Analysis.)
 */

const { listRequirementRows } = require('./requirementFrLevel');
const { isTemplateV2 } = require('../constants/requirementTemplate.constants');

const HEURISTIC_THRESHOLD = 40;
const FULL_ENGINE_THRESHOLD = 80;

function listPackValidationIssues(pack) {
  if (Array.isArray(pack?.importIssues)) return pack.importIssues;
  if (Array.isArray(pack?.validation?.errors)) return pack.validation.errors;
  if (Array.isArray(pack?.validation?.issues)) return pack.validation.issues;
  return [];
}

function listBlockingValidationCodes(pack) {
  const codes = [];
  const seen = new Set();
  for (const issue of listPackValidationIssues(pack)) {
    if (issue?.severity && issue.severity !== 'error') continue;
    const code = String(issue?.code || '').trim() || 'REQ_VALIDATION_ERROR';
    if (seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

function countValidationErrors(pack) {
  return listPackValidationIssues(pack).filter((issue) => !issue?.severity || issue.severity === 'error')
    .length;
}

function hasPlatformValue(platform) {
  if (Array.isArray(platform)) return platform.length > 0;
  return Boolean(String(platform || '').trim());
}

/**
 * WHAT readiness + canRunAiAnalysis from stored validation errors (no Excel re-parse).
 */
function computePlanningReadiness(pack) {
  const overview = pack?.overview || {};
  const frList = pack?.functionalRequirements || [];
  const requirementRows = listRequirementRows(frList);
  const errorCount = countValidationErrors(pack);
  const blockingCodes = listBlockingValidationCodes(pack);
  const canRunAiAnalysis = errorCount === 0;

  const hasDeadline = Boolean(overview.deadline);
  const hasPlatform = hasPlatformValue(overview.platform);
  const hasRequirements = requirementRows.length > 0;

  let score = 0;
  if (hasDeadline) score += 30;
  if (hasPlatform) score += 20;
  if (hasRequirements) score += 50;
  if (!canRunAiAnalysis) score = Math.min(score, HEURISTIC_THRESHOLD - 1);

  return {
    hasDeadline,
    hasPlatform,
    hasFrLeaves: hasRequirements,
    hasAnyEffort: false,
    hasAnySkills: false,
    hasAnyRoles: false,
    leafCount: requirementRows.length,
    leavesWithHours: 0,
    /** @deprecated alias — FE submit used staffing; now mirrors WHAT gate */
    allLeavesStaffed: canRunAiAnalysis,
    missingLeafIds: [],
    errorCount,
    canRunAiAnalysis,
    blockingCodes,
    score,
    readyForHeuristic: canRunAiAnalysis && score >= HEURISTIC_THRESHOLD,
    readyForFullEngine: canRunAiAnalysis && score >= FULL_ENGINE_THRESHOLD,
    templateV2: isTemplateV2(pack?.templateVersion),
  };
}

function attachPlanningReadiness(pack) {
  if (!pack || typeof pack !== 'object') return pack;
  return {
    ...pack,
    planningReadiness: computePlanningReadiness(pack),
  };
}

function attachPlanningReadinessList(rows) {
  return (rows || []).map((row) => {
    const readiness = computePlanningReadiness(row);
    return {
      ...row,
      planningReadiness: pickPlanningReadinessSummary(row),
    };
  });
}

/** @deprecated use canRunAiAnalysis — kept for callers */
function allLeavesHaveStaffing(pack) {
  return Boolean(computePlanningReadiness(pack).canRunAiAnalysis);
}

function buildWhatNotReadyError(pack, { errorCode, messagePrefix }) {
  const readiness = computePlanningReadiness(pack);
  if (readiness.canRunAiAnalysis) return null;
  const err = new Error(`${messagePrefix} (validationErrors)`);
  err.statusCode = 422;
  err.errorCode = errorCode;
  err.details = {
    ok: false,
    canRunAiAnalysis: false,
    blockingCodes: readiness.blockingCodes,
    errorCount: readiness.errorCount,
    score: readiness.score,
    allLeavesStaffed: false,
  };
  return err;
}

function assertPackReadyForSubmit(pack) {
  const err = buildWhatNotReadyError(pack, {
    errorCode: 'REQ_NOT_READY_FOR_SUBMIT',
    messagePrefix: 'Requirement pack chưa sẵn sàng gửi duyệt',
  });
  if (err) throw err;
  return computePlanningReadiness(pack);
}

/**
 * Gate for future AI Analysis jobs (W2+) — WHAT validation only.
 */
function assertPackReadyForAiAnalysis(pack) {
  const err = buildWhatNotReadyError(pack, {
    errorCode: 'REQ_NOT_READY_FOR_AI_ANALYSIS',
    messagePrefix: 'Requirement pack chưa sẵn sàng chạy AI Analysis',
  });
  if (err) throw err;
  return computePlanningReadiness(pack);
}

/**
 * Gate for AI run (Analysis) — same WHAT validation as Analysis helper.
 */
function assertPackReadyForAiRun(pack) {
  const err = buildWhatNotReadyError(pack, {
    errorCode: 'REQ_NOT_READY_FOR_AI_RUN',
    messagePrefix: 'Requirement pack chưa sẵn sàng chạy AI Analysis',
  });
  if (err) throw err;
  return computePlanningReadiness(pack);
}

function pickPlanningReadinessSummary(pack) {
  const readiness = computePlanningReadiness(pack);
  return {
    score: readiness.score,
    readyForHeuristic: readiness.readyForHeuristic,
    readyForFullEngine: readiness.readyForFullEngine,
    leafCount: readiness.leafCount,
    leavesWithHours: readiness.leavesWithHours,
    allLeavesStaffed: readiness.allLeavesStaffed,
    missingLeafIds: readiness.missingLeafIds,
    canRunAiAnalysis: readiness.canRunAiAnalysis,
    errorCount: readiness.errorCount,
    blockingCodes: readiness.blockingCodes,
  };
}

function assertPreviewReadyForImport(packPayload) {
  // Confirm already blocked session.errorCount > 0; no Role/Skill/Hours gate.
  return computePlanningReadiness(packPayload);
}

/** Compact gate payload for analysis callers */
function resolveAiAnalysisGate(pack) {
  const readiness = computePlanningReadiness(pack);
  return {
    ok: readiness.canRunAiAnalysis,
    canRunAiAnalysis: readiness.canRunAiAnalysis,
    blockingCodes: readiness.blockingCodes,
  };
}

module.exports = {
  computePlanningReadiness,
  attachPlanningReadiness,
  attachPlanningReadinessList,
  pickPlanningReadinessSummary,
  allLeavesHaveStaffing,
  assertPackReadyForSubmit,
  assertPackReadyForAiRun,
  assertPackReadyForAiAnalysis,
  assertPreviewReadyForImport,
  resolveAiAnalysisGate,
  countValidationErrors,
  listBlockingValidationCodes,
  HEURISTIC_THRESHOLD,
  FULL_ENGINE_THRESHOLD,
};
