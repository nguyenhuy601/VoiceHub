/**
 * Tools that must run as Pattern B nodes on phase graphs — never invokeTool.
 */

const HOW_SEC_PHASE_ONLY = Object.freeze([
  'ArchitectureTool',
  'DependencyTool',
  'RiskTool',
  'QualityPlanTool',
  'DeployPlanTool',
  'EffortTool',
]);

function isHowSecPhaseOnly(toolName) {
  return HOW_SEC_PHASE_ONLY.includes(String(toolName || ''));
}

function isWhatSectionPhaseOnly(toolName) {
  const name = String(toolName || '');
  return /^What[A-Za-z]+Tool$/.test(name);
}

function assertPhaseGraphOnly(toolName, phaseHint = 'how') {
  const err = new Error(
    `${toolName} runs only as Pattern B node on ${phaseHint}PhaseGraph (Send→addNode). Not via invokeTool/catalog.`
  );
  err.code = 'PHASE_GRAPH_ONLY';
  throw err;
}

module.exports = {
  HOW_SEC_PHASE_ONLY,
  isHowSecPhaseOnly,
  isWhatSectionPhaseOnly,
  assertPhaseGraphOnly,
};
