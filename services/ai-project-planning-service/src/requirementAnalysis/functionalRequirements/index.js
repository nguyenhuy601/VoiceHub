/**
 * Wave 0 entry exports for Functional Requirement Analysis.
 */
module.exports = {
  ...require('./analyzeFunctionalRequirements'),
  runG4SemanticAnalysis: require('./g4SemanticAnalysis').runG4SemanticAnalysis,
};
