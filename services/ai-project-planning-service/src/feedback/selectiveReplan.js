/**
 * G16 selective re-plan — map impactScope → HOW tool steps by toolName (RULE-PO-05).
 * HARD-01: ProjectPlanTool never autoConfirm.
 * HARD-02: one impactScope resolution per Loop2 (single path).
 */

const {
  HOW_PHASE_TOOL_STEPS,
  resolveStepsForToolNames,
} = require('../orchestration/jobToToolsMap');

const SCOPE_TO_TOOLS = Object.freeze({
  resource: ['EmployeeMatchingTool'],
  // Rematch then reschedule (Loop2 Who×When)
  schedule: ['EmployeeMatchingTool', 'SequencingTool', 'ScheduleTool'],
  effort: ['EffortTool'],
  WBS: ['WbsTool', 'DependencyTool'],
  wbs: ['WbsTool', 'DependencyTool'],
  structure: ['WbsTool', 'DependencyTool'],
  architecture: ['ArchitectureTool', 'RiskTool'],
  risk: ['RiskTool'],
  requirement: ['WbsTool', 'DependencyTool'],
});

/**
 * @param {string[]|string} impactScope
 * @returns {Array<{ toolName: string, autoConfirm?: boolean }>}
 */
function resolveToolsForImpactScope(impactScope) {
  const scopes = Array.isArray(impactScope)
    ? impactScope
    : String(impactScope || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

  if (!scopes.length) {
    return HOW_PHASE_TOOL_STEPS.map((s) => ({
      toolName: s.toolName,
      autoConfirm: s.toolName === 'ProjectPlanTool' ? false : Boolean(s.autoConfirm),
    }));
  }

  const toolNames = [];
  const seen = new Set();
  for (const scope of scopes) {
    const tools =
      SCOPE_TO_TOOLS[scope] || SCOPE_TO_TOOLS[String(scope).toLowerCase()] || [];
    for (const name of tools) {
      if (seen.has(name)) continue;
      seen.add(name);
      toolNames.push(name);
    }
  }

  const steps = resolveStepsForToolNames(toolNames);
  // HARD-01: never autoConfirm ProjectPlan on selective
  return (steps.length
    ? steps
    : HOW_PHASE_TOOL_STEPS.map((s) => ({
        toolName: s.toolName,
        autoConfirm: s.toolName === 'ProjectPlanTool' ? false : Boolean(s.autoConfirm),
      }))
  ).map((s) =>
    s.toolName === 'ProjectPlanTool' ? { ...s, autoConfirm: false } : s
  );
}

module.exports = {
  SCOPE_TO_TOOLS,
  resolveToolsForImpactScope,
};
