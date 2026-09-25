/**
 * Compact V2 orchestrator — retired in-process path.
 * Jobs run via ai-project-planning-service job registry.
 */
const { isCompactV2Enabled } = require("./aiAnalysisCompactPolicy");

function removed(name) {
  const err = new Error(`${name} compact path removed — use APS remote jobs`);
  err.code = "COMPACT_INPROCESS_REMOVED";
  throw err;
}

async function runCompactRequirementAnalysis() {
  return removed("runCompactRequirementAnalysis");
}
async function runCompactCapabilityAnalysis() {
  return removed("runCompactCapabilityAnalysis");
}
async function runCompactWbsGeneration() {
  return removed("runCompactWbsGeneration");
}
async function runCompactDependencyAnalysis() {
  return removed("runCompactDependencyAnalysis");
}
async function runCompactArchitectureRiskAnalysis() {
  return removed("runCompactArchitectureRiskAnalysis");
}

module.exports = {
  isCompactV2Enabled,
  runCompactRequirementAnalysis,
  runCompactCapabilityAnalysis,
  runCompactWbsGeneration,
  runCompactDependencyAnalysis,
  runCompactArchitectureRiskAnalysis,
};
