/**
 * Planning skill package (G17).
 */
const planningSkill = {
  skillId: 'planning',
  version: '1.0.0',
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
    'ScheduleTool',
    'ArchitectureTool',
    'RiskTool',
  ],
};

module.exports = { planningSkill };
