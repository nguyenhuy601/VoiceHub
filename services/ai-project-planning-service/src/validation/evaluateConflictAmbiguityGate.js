/**
 * Legacy entry — delegates to Requirement Integrity Gate (RULE-RIG-01…05).
 * Prefer require('./requirementIntegrityGate').evaluateRequirementIntegrityGate.
 */

const {
  evaluateRequirementIntegrityGate,
  evaluateConflictAmbiguityGate,
} = require('./requirementIntegrityGate');

module.exports = {
  evaluateConflictAmbiguityGate,
  evaluateRequirementIntegrityGate,
};
