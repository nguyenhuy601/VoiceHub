/**
 * Derive G13 feasibility flags from G18 toolResults + container (single-SNAP).
 * HARD-01: read real capacityConflicts + recommendation overload; no silent pass.
 * No live CURRENT reads.
 */

function toolRan(toolResults, toolName) {
  return (Array.isArray(toolResults) ? toolResults : []).some(
    (t) => String(t?.toolName || '') === toolName
  );
}

function collectCapacityConflicts(resource = {}, planning = {}) {
  const fromResource = Array.isArray(resource.capacityConflicts)
    ? resource.capacityConflicts
    : [];
  const fromPlanningSchedule = Array.isArray(planning.schedule?.conflicts)
    ? planning.schedule.conflicts
    : [];
  const fromResourceSchedule = Array.isArray(resource.schedule?.conflicts)
    ? resource.schedule.conflicts
    : [];
  return [...fromResource, ...fromPlanningSchedule, ...fromResourceSchedule];
}

/** Prefer candidates[]; fall back to shortlist[] (HOW matching writes both). */
function recommendationCandidates(rec = {}) {
  if (Array.isArray(rec.candidates) && rec.candidates.length) return rec.candidates;
  if (Array.isArray(rec.shortlist) && rec.shortlist.length) return rec.shortlist;
  return [];
}

/**
 * Overload from legacy matching.overload OR candidates/shortlist with overload / feasible:false.
 * HARD-01: do not ignore shortlist-only shapes.
 */
function collectOverloadEntries(resource = {}) {
  const matching = resource.matching || {};
  const legacy = Array.isArray(matching.overload) ? matching.overload : [];
  const fromRecs = [];
  const recommendations = Array.isArray(resource.recommendations)
    ? resource.recommendations
    : [];
  for (const rec of recommendations) {
    const assigned = rec.assignedUserId || rec.selectedUserId || null;
    const candidates = recommendationCandidates(rec);
    for (const c of candidates) {
      const reasons = Array.isArray(c.reasons) ? c.reasons : [];
      const overloadReason = reasons.some((r) =>
        /overload|day_overload|cumulative_overload/i.test(String(r))
      );
      // Capacity/overload only — skill/role infeasible alone is not overload
      if (c.overload === true || overloadReason) {
        fromRecs.push({
          taskId: rec.taskId,
          userId: c.userId,
          reasons: reasons.length ? reasons : ['overload'],
        });
      }
    }
    // Assigned pick that is not feasible
    if (assigned) {
      const pick = candidates.find((c) => String(c.userId) === String(assigned));
      if (pick && pick.feasible === false) {
        fromRecs.push({
          taskId: rec.taskId,
          userId: assigned,
          reasons: pick.reasons || ['infeasible_assignment'],
        });
      }
    }
  }
  return [...legacy, ...fromRecs];
}

function collectUnassigned(resource = {}, matching = null) {
  if (Array.isArray(matching?.unassigned)) return matching.unassigned;
  if (Array.isArray(resource.unassigned)) return resource.unassigned;
  if (Array.isArray(resource.completion?.unassignedTaskIds)) {
    return resource.completion.unassignedTaskIds;
  }
  const recommendations = Array.isArray(resource.recommendations)
    ? resource.recommendations
    : [];
  return recommendations
    .filter((r) => {
      const cands = recommendationCandidates(r);
      const feasible = cands.some((c) => c.feasible !== false);
      return !feasible || cands.length === 0;
    })
    .map((r) => r.taskId)
    .filter(Boolean);
}

/**
 * @param {{ toolResults?: object[], container?: object }} input
 * @returns {{
 *   coverageOk: boolean,
 *   resourceOk: boolean,
 *   scheduleOk: boolean,
 *   architectureOk: boolean,
 *   riskOk: boolean,
 *   qualityPlanOk: boolean,
 *   deployPlanOk: boolean,
 * }}
 */
function deriveFeasibilityFlags(input = {}) {
  const { isQualityPlanStructurallyOk } = require('../engines/qualityPlan');
  const { isDeployPlanStructurallyOk } = require('../engines/deployPlan');
  const toolResults = Array.isArray(input.toolResults) ? input.toolResults : [];
  const container =
    input.container && typeof input.container === 'object' ? input.container : {};
  const planning =
    container.planning && typeof container.planning === 'object'
      ? container.planning
      : {};
  const resource =
    container.resource && typeof container.resource === 'object'
      ? container.resource
      : {};
  const analyses =
    container.analyses && typeof container.analyses === 'object'
      ? container.analyses
      : {};

  const tasks = Array.isArray(planning.tasks) ? planning.tasks : [];
  const matching = resource.matching || planning.matching || null;
  const overload = collectOverloadEntries(resource);
  const unassigned = collectUnassigned(resource, matching);
  const scheduleConflicts = collectCapacityConflicts(resource, planning);
  const riskHigh =
    Number(analyses.risk?.summary?.highCount || analyses.risk?.highCount || 0) > 0 ||
    String(analyses.risk?.overallLevel || '').toLowerCase() === 'high';

  const coverageOk =
    tasks.length > 0 ||
    toolRan(toolResults, 'WbsTool') ||
    toolRan(toolResults, 'RequirementAnalysisTool');

  const capacityPlan =
    resource.capacityPlan && typeof resource.capacityPlan === 'object'
      ? resource.capacityPlan
      : null;
  const capacityGapHours = Number(capacityPlan?.totalGapHours) || 0;
  const hardCapacityConflicts = scheduleConflicts.filter((c) =>
    ['zero_capacity_day', 'unresolved_effort'].includes(String(c?.type || ''))
  );
  // Hard-gate: unassigned / overload / demand>supply gap / packing infeasible days
  const resourceOk =
    !toolRan(toolResults, 'EmployeeMatchingTool') ||
    (overload.length === 0 &&
      unassigned.length === 0 &&
      capacityGapHours <= 0 &&
      (!toolRan(toolResults, 'ScheduleTool') || hardCapacityConflicts.length === 0));

  const scheduleOk =
    !toolRan(toolResults, 'ScheduleTool') || scheduleConflicts.length === 0;

  const architectureOk =
    !toolRan(toolResults, 'ArchitectureTool') ||
    analyses.architectureImpact?.blocking !== true;

  const riskOk = !toolRan(toolResults, 'RiskTool') || !riskHigh;

  const qualityPlanOk =
    !toolRan(toolResults, 'QualityPlanTool') ||
    isQualityPlanStructurallyOk(planning.qualityPlan);

  const deployPlanOk =
    !toolRan(toolResults, 'DeployPlanTool') ||
    isDeployPlanStructurallyOk(planning.deployPlan);

  return {
    coverageOk: Boolean(coverageOk),
    resourceOk: Boolean(resourceOk),
    scheduleOk: Boolean(scheduleOk),
    architectureOk: Boolean(architectureOk),
    riskOk: Boolean(riskOk),
    qualityPlanOk: Boolean(qualityPlanOk),
    deployPlanOk: Boolean(deployPlanOk),
  };
}

module.exports = {
  deriveFeasibilityFlags,
  collectCapacityConflicts,
  collectOverloadEntries,
  collectUnassigned,
  recommendationCandidates,
};
