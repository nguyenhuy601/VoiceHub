/**
 * Derive G13 feasibility flags from G18 toolResults + container (single-SNAP).
 * No live CURRENT reads.
 */

function toolRan(toolResults, toolName) {
  return (Array.isArray(toolResults) ? toolResults : []).some(
    (t) => String(t?.toolName || '') === toolName
  );
}

/**
 * @param {{ toolResults?: object[], container?: object }} input
 * @returns {{ coverageOk: boolean, resourceOk: boolean, scheduleOk: boolean, architectureOk: boolean, riskOk: boolean }}
 */
function deriveFeasibilityFlags(input = {}) {
  const toolResults = Array.isArray(input.toolResults) ? input.toolResults : [];
  const container =
    input.container && typeof input.container === 'object' ? input.container : {};
  const planning = container.planning && typeof container.planning === 'object'
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
  const overload = Array.isArray(matching?.overload) ? matching.overload : [];
  const unassigned = Array.isArray(matching?.unassigned)
    ? matching.unassigned
    : Array.isArray(resource.unassigned)
      ? resource.unassigned
      : [];
  const scheduleConflicts = Array.isArray(planning.schedule?.conflicts)
    ? planning.schedule.conflicts
    : Array.isArray(resource.schedule?.conflicts)
      ? resource.schedule.conflicts
      : [];
  const riskHigh =
    Number(analyses.risk?.summary?.highCount || analyses.risk?.highCount || 0) > 0 ||
    String(analyses.risk?.overallLevel || '').toLowerCase() === 'high';

  const coverageOk =
    tasks.length > 0 ||
    toolRan(toolResults, 'WbsTool') ||
    toolRan(toolResults, 'RequirementAnalysisTool');

  const resourceOk =
    !toolRan(toolResults, 'EmployeeMatchingTool') ||
    (overload.length === 0 && unassigned.length === 0);

  const scheduleOk =
    !toolRan(toolResults, 'ScheduleTool') || scheduleConflicts.length === 0;

  const architectureOk =
    !toolRan(toolResults, 'ArchitectureTool') ||
    analyses.architectureImpact?.blocking !== true;

  const riskOk = !toolRan(toolResults, 'RiskTool') || !riskHigh;

  return {
    coverageOk: Boolean(coverageOk),
    resourceOk: Boolean(resourceOk),
    scheduleOk: Boolean(scheduleOk),
    architectureOk: Boolean(architectureOk),
    riskOk: Boolean(riskOk),
  };
}

module.exports = { deriveFeasibilityFlags };
