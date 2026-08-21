const { FR_LEAF_LEVEL } = require('../constants/requirementStaffing.constants');

const HEURISTIC_THRESHOLD = 40;
const FULL_ENGINE_THRESHOLD = 80;

function leafMissingStaffingReasons(row) {
  const missing = [];
  if (!(row.suggestedSkills || []).length) missing.push('skills');
  if (row.estimateHours == null || Number(row.estimateHours) <= 0) missing.push('hours');
  if (!String(row.suggestedRoleKey || '').trim()) missing.push('role');
  return missing;
}

function listMissingLeafStaffing(frList = []) {
  const leaves = (frList || []).filter((row) => row.level === FR_LEAF_LEVEL);
  const missingLeafIds = [];
  leaves.forEach((row, index) => {
    const reasons = leafMissingStaffingReasons(row);
    if (!reasons.length) return;
    const id = String(row.externalId || row.name || '').trim() || `leaf#${index + 1}`;
    missingLeafIds.push(id);
  });
  return missingLeafIds;
}

function computePlanningReadiness(pack) {
  const overview = pack?.overview || {};
  const frList = pack?.functionalRequirements || [];
  const staffing = pack?.staffingPlan || {};

  const leaves = frList.filter((row) => row.level === FR_LEAF_LEVEL);
  const leavesWithHours = leaves.filter(
    (row) => row.estimateHours != null && Number(row.estimateHours) > 0
  );
  const hasAnySkills =
    frList.some((row) => (row.suggestedSkills || []).length > 0) ||
    (staffing.requiredSkills || []).length > 0;
  const hasAnyRoles =
    frList.some((row) => String(row.suggestedRoleKey || '').trim()) ||
    (staffing.requiredRoles || []).length > 0;

  const hasDeadline = Boolean(overview.deadline);
  const hasPlatform = Array.isArray(overview.platform) && overview.platform.length > 0;
  const hasFrLeaves = leaves.length > 0;
  const hasAnyEffort =
    leavesWithHours.length > 0 ||
    (staffing.estimatedHoursTotal != null && Number(staffing.estimatedHoursTotal) > 0);

  let score = 0;
  if (hasDeadline) score += 15;
  if (hasFrLeaves) score += 25;
  if (hasAnyEffort) score += 25;
  if (hasAnySkills) score += 20;
  if (hasAnyRoles) score += 15;

  const missingLeafIds = listMissingLeafStaffing(frList);
  const allLeavesStaffed = leaves.length > 0 && missingLeafIds.length === 0;

  return {
    hasDeadline,
    hasPlatform,
    hasFrLeaves,
    hasAnyEffort,
    hasAnySkills,
    hasAnyRoles,
    leafCount: leaves.length,
    leavesWithHours: leavesWithHours.length,
    allLeavesStaffed,
    missingLeafIds,
    score,
    readyForHeuristic: score >= HEURISTIC_THRESHOLD,
    readyForFullEngine: score >= FULL_ENGINE_THRESHOLD,
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
      planningReadiness: {
        score: readiness.score,
        readyForHeuristic: readiness.readyForHeuristic,
        readyForFullEngine: readiness.readyForFullEngine,
        leafCount: readiness.leafCount,
        leavesWithHours: readiness.leavesWithHours,
        allLeavesStaffed: readiness.allLeavesStaffed,
        missingLeafIds: readiness.missingLeafIds,
      },
    };
  });
}

/**
 * Every FR leaf must have skills, effort hours > 0, and a suggested role.
 * Packs with zero leaves are not staffed-complete.
 */
function allLeavesHaveStaffing(pack) {
  return Boolean(computePlanningReadiness(pack).allLeavesStaffed);
}

function buildNotReadyError(pack, { errorCode, messagePrefix }) {
  const readiness = computePlanningReadiness(pack);
  if (readiness.readyForHeuristic && readiness.allLeavesStaffed) {
    return null;
  }
  const missing = [];
  if (!readiness.readyForHeuristic) {
    missing.push(`planningScore=${readiness.score}<${HEURISTIC_THRESHOLD}`);
  }
  if (!readiness.allLeavesStaffed) {
    missing.push('leafStaffingIncomplete');
  }
  const err = new Error(`${messagePrefix} (${missing.join(', ')})`);
  err.statusCode = 422;
  err.errorCode = errorCode;
  err.details = {
    score: readiness.score,
    readyForHeuristic: readiness.readyForHeuristic,
    allLeavesStaffed: readiness.allLeavesStaffed,
    missingLeafIds: readiness.missingLeafIds,
    hasDeadline: readiness.hasDeadline,
    hasFrLeaves: readiness.hasFrLeaves,
    hasAnyEffort: readiness.hasAnyEffort,
    hasAnySkills: readiness.hasAnySkills,
    hasAnyRoles: readiness.hasAnyRoles,
  };
  return err;
}

function assertPackReadyForSubmit(pack) {
  const err = buildNotReadyError(pack, {
    errorCode: 'REQ_NOT_READY_FOR_SUBMIT',
    messagePrefix: 'Requirement pack chưa sẵn sàng gửi duyệt',
  });
  if (err) throw err;
  return computePlanningReadiness(pack);
}

function assertPackReadyForAiRun(pack) {
  const err = buildNotReadyError(pack, {
    errorCode: 'REQ_NOT_READY_FOR_AI',
    messagePrefix: 'Requirement pack chưa sẵn sàng chạy AI planning',
  });
  if (err) throw err;
  return computePlanningReadiness(pack);
}

module.exports = {
  computePlanningReadiness,
  attachPlanningReadiness,
  attachPlanningReadinessList,
  allLeavesHaveStaffing,
  listMissingLeafStaffing,
  assertPackReadyForSubmit,
  assertPackReadyForAiRun,
  HEURISTIC_THRESHOLD,
  FULL_ENGINE_THRESHOLD,
};
