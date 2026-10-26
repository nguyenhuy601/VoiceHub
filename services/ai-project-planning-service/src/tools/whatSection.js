/**
 * WHAT section tools — Phase LangGraph Pattern B only (whatPhaseGraph Send→subgraph).
 */

async function runWhatSectionTool(engineId) {
  const err = new Error(
    `What* section (${engineId}) runs only on whatPhaseGraph (Pattern B). Not via invokeTool.`
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = { runWhatSectionTool };
