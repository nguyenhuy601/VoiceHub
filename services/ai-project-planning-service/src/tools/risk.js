async function risk() {
  const err = new Error(
    'RiskTool runs only on howPhaseGraph (Pattern B subgraph). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { risk };
