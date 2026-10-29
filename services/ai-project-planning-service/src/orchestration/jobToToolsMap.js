/**
 * HOW phase HOW tool sequence tool sequence — phase-only SoT (no job-id execute map).
 * RULE-PO-05: Selective filters this list by toolName.
 *
 * ScheduleTool: matching + capacity + empty sprint windows; Sprint HOW LLM owns Story→Sprint.
 * WBS, Dependency, Risk, Quality: LLM, không fallback engine.
 * BacklogMap không còn phase node — Gate1 stamp approvedBacklogStructure; WbsTool đọc SoT.
 * ProjectPlan: ghép kết quả đã có.
 * Sequencing / EmployeeMatching / Architecture / Effort / Deploy không còn phase node
 * (Matching gập vào ScheduleTool trước CPM).
 */

const HOW_PHASE_TOOL_STEPS = Object.freeze([
  // autoConfirm false: staged WBS checkpoint (AGENT_CORE_HITL_WBS_CHECKPOINT) before dependents.
  { toolName: 'WbsTool', autoConfirm: false, mode: 'llm' },
  { toolName: 'DependencyTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'RiskTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'QualityPlanTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'ScheduleTool', autoConfirm: true, mode: 'schedule_sprint' },
  // ProjectPlan assemble lives in graph node finalizePlan (not ReAct catalog).
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

