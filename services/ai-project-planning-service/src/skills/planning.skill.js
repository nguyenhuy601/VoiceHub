/**
 * Planning skill package (LLM runtime).
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
    'ScheduleTool',
    'RiskTool',
    'BacklogMapTool',
    'WbsTool',
    'DependencyTool',
    'ProjectPlanTool',
    'QualityPlanTool',
    'HierarchyTool',
    'InsightsTool',
    'RequirementAnalysisTool',
  ],
};

module.exports = { planningSkill };
