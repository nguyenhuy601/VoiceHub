/**

 * HOW phase G18 tool sequence — phase-only SoT (no job-id execute map).

 * RULE-PO-05: Selective filters this list by toolName.

 */



const HOW_PHASE_TOOL_STEPS = Object.freeze([

  { toolName: 'WbsTool', autoConfirm: true },

  { toolName: 'DependencyTool', autoConfirm: true },

  { toolName: 'ArchitectureTool', autoConfirm: false },

  { toolName: 'RiskTool', autoConfirm: true },

  { toolName: 'EffortTool', autoConfirm: true },

  { toolName: 'SequencingTool', autoConfirm: true },

  { toolName: 'EmployeeMatchingTool', autoConfirm: true },

  { toolName: 'ScheduleTool', autoConfirm: true },

  // Gate2 HITL: ProjectPlanTool never auto-confirms (RULE-PO-05)

  { toolName: 'ProjectPlanTool', autoConfirm: false },

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

