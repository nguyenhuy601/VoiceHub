async function effort() {
  const err = new Error(
    'EffortTool runs only on howPhaseGraph (Pattern B subgraph). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { effort };
