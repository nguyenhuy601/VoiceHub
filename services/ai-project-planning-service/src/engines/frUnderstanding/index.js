/**
 * FR-owned understanding StateGraph (ex-G4).
 * Production SoT: whatPhaseGraph node `runFrUnderstanding` (Pattern B).
 */

const {
  PROMPT_VERSION,
  buildFrUnderstandingGraph,
  runUnderstandPrefix,
  hasResumePartial,
  invokeFrUnderstandingStandalone,
  mapOptsToFrState,
  mapFrStateToPipelineResult,
} = require('./frUnderstandingGraph');

module.exports = {
  PROMPT_VERSION,
  buildFrUnderstandingGraph,
  runUnderstandPrefix,
  hasResumePartial,
  invokeFrUnderstandingStandalone,
  mapOptsToFrState,
  mapFrStateToPipelineResult,
};
