/**
 * HOW phase G18 tool sequence — phase-only SoT (no job-id execute map).
 * RULE-PO-05: Selective filters this list by toolName.
 *
 * Mode (see config/howSemanticLlmFlags.js):
 * - LLM hybrid (HOW_SEMANTIC_LLM / HOW_*_LLM): Wbs, Dependency, Architecture, Risk, Quality
 * - Heuristic/deterministic only: Effort, Sequencing, EmployeeMatching, Schedule, Deploy, ProjectPlan
 */

const HOW_PHASE_TOOL_STEPS = Object.freeze([
  { toolName: 'WbsTool', autoConfirm: true, mode: 'llm_hybrid' },
  { toolName: 'DependencyTool', autoConfirm: true, mode: 'llm_hybrid' },
  { toolName: 'ArchitectureTool', autoConfirm: false, mode: 'llm_hybrid' },
  { toolName: 'RiskTool', autoConfirm: true, mode: 'llm_hybrid' },
  // Step 4: Quality/Testing plan before Effort (QA work informs estimates)
  { toolName: 'QualityPlanTool', autoConfirm: true, mode: 'llm_hybrid' },
  { toolName: 'EffortTool', autoConfirm: true, mode: 'heuristic' },
  { toolName: 'SequencingTool', autoConfirm: true, mode: 'heuristic' },
  { toolName: 'EmployeeMatchingTool', autoConfirm: true, mode: 'heuristic' },
  { toolName: 'ScheduleTool', autoConfirm: true, mode: 'heuristic' },
  // Step 7: Deploy plan after Schedule (needs go-live / release dates)
  { toolName: 'DeployPlanTool', autoConfirm: true, mode: 'heuristic' },
  // Gate2 HITL: ProjectPlanTool never auto-confirms (RULE-PO-05)
  { toolName: 'ProjectPlanTool', autoConfirm: false, mode: 'heuristic' },
]);



const TOOL_BY_NAME = Object.freeze(

  Object.fromEntries(HOW_PHASE_TOOL_STEPS.map((s) => [s.toolName, s]))

);



/**

 * @param {string[]} toolNames

 * @returns {Array<{ toolName: string, autoConfirm?: boolean }>}

 */

function resolveStepsForToolNames(toolNames) {

  const names = Array.isArray(toolNames) ? toolNames : [];

  const steps = [];

  const seen = new Set();

  for (const raw of names) {

    const name = String(raw || '').trim();

    if (!name || seen.has(name)) continue;

    const base = TOOL_BY_NAME[name];

    if (!base) continue;

    seen.add(name);

    // Selective must not autoConfirm ProjectPlanTool

    const autoConfirm =

      name === 'ProjectPlanTool' ? false : Boolean(base.autoConfirm);

    steps.push({ toolName: name, autoConfirm });

  }

  return steps;

}



module.exports = {

  HOW_PHASE_TOOL_STEPS,

  TOOL_BY_NAME,

  resolveStepsForToolNames,

};

