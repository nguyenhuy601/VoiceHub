/**
 * Planning skill package (G17).
 */
const planningSkill = {
  skillId: 'planning',
  version: '1.1.0',
  objective: 'Select and interpret planning tools for WBS/assignment/schedule',
  methodology: 'tool-mediated; no direct business DB',
  outputSchema: {
    type: 'object',
    required: ['action'],
  },
  constraintInterpretation: 'Respect approved SRS + bound snapshot',
  toolUsagePolicy: {
    maxToolsPerStep: 3,
    requireEvidence: true,
  },
  allowedToolNames: [
    'EmployeeMatchingTool',
    'EffortTool',
    'SequencingTool',
    'ScheduleTool',
    'ArchitectureTool',
    'RiskTool',
    'WbsTool',
    'DependencyTool',
    'ProjectPlanTool',
    'HierarchyTool',
    'CapabilityTool',
    'InsightsTool',
    'RequirementAnalysisTool',
  ],
};

module.exports = { planningSkill };
