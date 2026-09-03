const {
  isFrExecutionLeaf,
  isFrRoleRequiredLevel,
  listFrExecutionLeaves,
} = require('./requirementFrLevel');

const HEURISTIC_THRESHOLD = 40;
const FULL_ENGINE_THRESHOLD = 80;

function executionLeafMissingStaffingReasons(row) {
  const missing = [];
  if (!(row.suggestedSkills || []).length) missing.push('skills');
  if (row.estimateHours == null || Number(row.estimateHours) <= 0) missing.push('hours');
  if (!String(row.suggestedRoleKey || '').trim()) missing.push('role');
  return missing;
}

function listMissingLeafStaffing(frList = []) {
  const missingLeafIds = [];
  const seen = new Set();

  for (const row of listFrExecutionLeaves(frList)) {
    const reasons = executionLeafMissingStaffingReasons(row);
    if (!reasons.length) continue;
    const id =
      String(row.externalId || row.name || '').trim() ||
      `leaf#${frList.indexOf(row) + 1}`;
    if (!seen.has(id)) {
      seen.add(id);
      missingLeafIds.push(id);
    }
  }

  frList.forEach((row, index) => {
    if (!isFrRoleRequiredLevel(row.level)) return;
    if (isFrExecutionLeaf(row, frList)) return;
    if (String(row.suggestedRoleKey || '').trim()) return;
    const id = String(row.externalId || row.name || '').trim() || `row#${index + 1}`;
    if (!seen.has(id)) {
      seen.add(id);
      missingLeafIds.push(id);
    }
  });

  return missingLeafIds;
}

function computePlanningReadiness(pack) {
  const overview = pack?.overview || {};
  const frList = pack?.functionalRequirements || [];
  const staffing = pack?.staffingPlan || {};

  const executionLeaves = listFrExecutionLeaves(frList);
  const leavesWithHours = executionLeaves.filter(
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
  const hasFrLeaves = executionLeaves.length > 0;
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
  const allLeavesStaffed = executionLeaves.length > 0 && missingLeafIds.length === 0;

  return {
    hasDeadline,
    hasPlatform,
    hasFrLeaves,
    hasAnyEffort,
    hasAnySkills,
    hasAnyRoles,
    leafCount: executionLeaves.length,
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

function allLeavesHaveStaffing(pack) {
  return Boolean(computePlanningReadiness(pack).allLeavesStaffed);
}

function buildNotReadyError(pack, { errorCode, messagePrefix }) {
  const readiness = computePlanningReadiness(pack);
  if (readiness.allLeavesStaffed) {
    return null;
  }
  const missing = ['leafStaffingIncomplete'];
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
  };
}

function assertPreviewReadyForImport(packPayload) {
  const err = buildNotReadyError(packPayload, {
    errorCode: 'REQ_IMPORT_STAFFING_INCOMPLETE',
    messagePrefix: 'Không thể import — FR execution row chưa đủ staffing',
  });
  if (err) throw err;
  return computePlanningReadiness(packPayload);
}

module.exports = {
  computePlanningReadiness,
  attachPlanningReadiness,
  attachPlanningReadinessList,
  pickPlanningReadinessSummary,
  allLeavesHaveStaffing,
  listMissingLeafStaffing,
  assertPackReadyForSubmit,
  assertPackReadyForAiRun,
  assertPreviewReadyForImport,
  HEURISTIC_THRESHOLD,
  FULL_ENGINE_THRESHOLD,
};
