/**
 * Requirement understanding skill package (G4 via G17).
 */
const requirementUnderstandingSkill = {
  skillId: 'requirementUnderstanding',
  version: '1.1.0',
  objective: 'Extract structured requirements, candidate relationships, ambiguities, assumptions',
  methodology: 'projection + structured extract; relationships are candidates until validated',
  outputSchema: {
    type: 'object',
    required: ['requirements', 'relationships', 'ambiguities', 'assumptions', 'evidence'],
    properties: {
      requirements: { type: 'array' },
      relationships: { type: 'array' },
      ambiguities: { type: 'array' },
      assumptions: { type: 'array' },
      evidence: { type: 'array' },
    },
  },
  constraintInterpretation:
    'RULE-06 projection whitelist only; RULE-01 no effort/match/schedule; RULE-10 evidence on claims',
  toolUsagePolicy: {
    maxToolsPerStep: 2,
    requireEvidence: true,
  },
  allowedToolNames: ['RequirementAnalysisTool'],
};

module.exports = { requirementUnderstandingSkill };
