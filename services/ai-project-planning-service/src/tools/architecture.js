/**
 * ArchitectureTool — Phase LangGraph Pattern B only (howPhaseGraph Send→subgraph).
 * Catalog/invokeTool path removed.
 */

async function architecture() {
  const err = new Error(
    'ArchitectureTool runs only on howPhaseGraph (Pattern B subgraph). Not via invokeTool.'
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { architecture };
