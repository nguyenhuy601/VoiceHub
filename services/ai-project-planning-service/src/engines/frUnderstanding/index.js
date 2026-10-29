/**
 * Legacy FR understanding graph removed.
 * Production: semantic/frSectionHooks.runFrSectionDerive via WhatFrTool.
 */

function removed(name) {
  const err = new Error(
    `${name} removed: FR runs via WhatFrTool → src/semantic/frSectionHooks.`
  );
  err.code = 'FR_UNDERSTANDING_REMOVED';
  throw err;
}

module.exports = {
  PROMPT_VERSION: 'removed-use-semantic_fr_section_v1',
  buildFrUnderstandingGraph: () => removed('buildFrUnderstandingGraph'),
  runUnderstandPrefix: () => removed('runUnderstandPrefix'),
  hasResumePartial: () => false,
  invokeFrUnderstandingStandalone: () => removed('invokeFrUnderstandingStandalone'),
  mapOptsToFrState: () => removed('mapOptsToFrState'),
  mapFrStateToPipelineResult: () => removed('mapFrStateToPipelineResult'),
};
