/**
 * WhatFrTool catalog stub — production SoT is whatPhaseGraph node `runFrUnderstanding`.
 */

async function whatFr() {
  const err = new Error(
    'WhatFrTool runs only as runFrUnderstanding node on whatPhaseGraph (Pattern B). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { whatFr };
