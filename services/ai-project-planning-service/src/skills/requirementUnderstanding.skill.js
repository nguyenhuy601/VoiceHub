/**
 * Requirement understanding skill package (G4 via G17).
 */
const requirementUnderstandingSkill = {
  skillId: 'requirementUnderstanding',
  version: '1.0.0',
  objective: 'Extract structured requirements and ambiguities from Context Package',
  methodology: 'projection + structured extract; relationships are candidates until validated',
  outputSchema: {
    type: 'object',
    required: ['action'],
  },
  constraintInterpretation: 'RULE-06 projection whitelist only',
  toolUsagePolicy: {
    maxToolsPerStep: 2,
    requireEvidence: true,
  },
  allowedToolNames: ['RequirementAnalysisTool'],
};

module.exports = { requirementUnderstandingSkill };
