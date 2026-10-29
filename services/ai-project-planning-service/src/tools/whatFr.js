/**
 * WhatFrTool catalog stub — production SoT is whatPhaseGraph Pattern B section
 * buildWhatSectionToolSubgraph('fr') → semantic/frSectionHooks (not invokeTool).
 */

function whatFr() {
  const err = new Error(
    'WhatFrTool runs only as WhatFrTool node on whatPhaseGraph (semantic FR section). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { whatFr };
