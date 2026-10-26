/**
 * HOW phase G18 tool sequence — phase-only SoT (no job-id execute map).
 * RULE-PO-05: Selective filters this list by toolName.
 *
 * Heuristic còn lại chỉ trong ScheduleTool: matching + lịch (capacity) + sprint.
 * WBS, Dependency, Risk, Quality: LLM, không fallback engine.
 * BacklogMap: map cấu trúc Gate 1 đã duyệt. ProjectPlan: ghép kết quả đã có.
 * Sequencing / EmployeeMatching / Architecture / Effort / Deploy không còn phase node
 * (Matching gập vào ScheduleTool trước CPM).
 */

const HOW_PHASE_TOOL_STEPS = Object.freeze([
  { toolName: 'BacklogMapTool', autoConfirm: true, mode: 'sot' },
  { toolName: 'WbsTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'DependencyTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'RiskTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'QualityPlanTool', autoConfirm: true, mode: 'llm' },
  { toolName: 'ScheduleTool', autoConfirm: true, mode: 'schedule_sprint' },
  // Gate2 HITL: ProjectPlanTool never auto-confirms (RULE-PO-05)
  { toolName: 'ProjectPlanTool', autoConfirm: false, mode: 'assemble' },
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

