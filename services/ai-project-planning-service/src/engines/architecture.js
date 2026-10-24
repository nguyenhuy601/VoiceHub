/**
 * Emit analyses only — never echo planning.* (avoids parallel/sequential merge wiping WBS leaves).
 */
function applyArchitectureToContainer(container, archResult) {
  void container;
  return {
    analyses: {
      architectureImpact: {
        status: archResult.status || 'ready',
        model: archResult.model || null,
        generatedAt: archResult.generatedAt || new Date().toISOString(),
        items: archResult.items || [],
        entities: [],
        edges: archResult.dependencies || [],
        dataFlows: [],
        orderHint: [],
        chains: archResult.chains || [],
        meta: archResult.meta || {},
      },
    },
  };
}

module.exports = {
  applyArchitectureToContainer,
};
