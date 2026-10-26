async function deployPlan() {
  const err = new Error(
    'DeployPlanTool runs only on howPhaseGraph (Pattern B subgraph). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { deployPlan };
