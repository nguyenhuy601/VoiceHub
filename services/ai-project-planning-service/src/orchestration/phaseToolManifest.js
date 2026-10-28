/**
 * Tools available on Phase LangGraph (prompt + Send targets).
 * Sec/section = Pattern B subgraph nodes — not catalog invoke.
 */

const { CANONICAL_ORDER: HOW_CANONICAL } = require('./howToolDag');
const { CANONICAL_ORDER: WHAT_CANONICAL } = require('./whatToolDag');
const { HOW_SEC_PHASE_ONLY } = require('./phaseGraphOnly');
const { WHAT_SECTION_TOOLS, WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');

const TOOL_BLURBS = Object.freeze({
  WbsTool: 'LLM WBS from Gate1 Story SoT (approvedBacklogStructure) → Task leaves',
  DependencyTool: 'Task dependency graph (sec subgraph)',
  RiskTool: 'Risk identification (sec subgraph)',
  QualityPlanTool: 'Quality & testing plan (sec subgraph)',
  ScheduleTool: 'Schedule / capacity timeline',
  ProjectPlanTool: 'Assemble Gate 2 plan shell',
  ArchitectureTool: 'Architecture impact (sec subgraph)',
  DeployPlanTool: 'Deploy/release plan (sec subgraph)',
  EffortTool: 'Effort & roles (sec subgraph)',
  [WHAT_FR_TOOL]: 'WHAT FR: propose / G4 / decompose',
});

function howPhaseToolNames() {
  // ProjectPlanTool is graph finalizePlan — not LLM-selectable.
  return [...new Set([...HOW_CANONICAL, ...HOW_SEC_PHASE_ONLY])].filter(
    (name) => name !== 'ProjectPlanTool'
  );
}

function whatPhaseToolNames() {
  return [
    ...new Set([
      ...WHAT_CANONICAL,
      WHAT_FR_TOOL,
      ...WHAT_SECTION_TOOLS.map((s) => s.toolName),
    ]),
  ];
}

function describePhaseToolsForPrompt(phase) {
  const names = phase === 'how' ? howPhaseToolNames() : whatPhaseToolNames();
  return names.map((toolName) => {
    const sec = WHAT_SECTION_TOOLS.find((s) => s.toolName === toolName);
    const description =
      TOOL_BLURBS[toolName] ||
      (sec
        ? `WHAT ${sec.engineId} section (Pattern B subgraph)`
        : toolName);
    return { toolName, description, requires: [] };
  });
}

module.exports = {
  howPhaseToolNames,
  whatPhaseToolNames,
  describePhaseToolsForPrompt,
  TOOL_BLURBS,
};
