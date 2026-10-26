async function qualityPlan() {
  const err = new Error(
    'QualityPlanTool runs only on howPhaseGraph (Pattern B subgraph). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { qualityPlan };
