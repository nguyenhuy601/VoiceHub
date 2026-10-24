/**
 * Shared semantic layer kernel.
 * Meaning, evidence, and context packages — not planning math.
 * Per-tool HOW briefs stay in howSecs until a later gated step.
 */

module.exports = {
  ...require('./hash'),
  ...require('./intake'),
  ...require('./normalize'),
  ...require('./identity'),
  ...require('./resolutionPolicy'),
  ...require('./assertionDraft'),
  ...require('./decisionLog'),
  ...require('./purposeProfiles'),
  ...require('./bindContextRequest'),
  ...require('./rankFusion'),
  ...require('./admit'),
  ...require('./changeImpact'),
  ...require('./calibration'),
  ...require('./assembleContext'),
};
