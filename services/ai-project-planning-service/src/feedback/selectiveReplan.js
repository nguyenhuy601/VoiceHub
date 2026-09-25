/**

 * G16 selective re-plan — map impactScope → HOW tool steps by toolName (RULE-PO-05).

 */



const {

  HOW_PHASE_TOOL_STEPS,

  resolveStepsForToolNames,

} = require('../orchestration/jobToToolsMap');



const SCOPE_TO_TOOLS = Object.freeze({

  resource: ['EmployeeMatchingTool'],

  schedule: ['ScheduleTool', 'SequencingTool'],

  effort: ['EffortTool'],

  WBS: ['WbsTool', 'DependencyTool'],

  wbs: ['WbsTool', 'DependencyTool'],

  architecture: ['ArchitectureTool', 'RiskTool'],

  risk: ['RiskTool'],

  requirement: ['WbsTool', 'DependencyTool'],

});



/**

 * @param {string[]|string} impactScope

 * @returns {Array<{ toolName: string, autoConfirm?: boolean }>}

 */

function resolveToolsForImpactScope(impactScope) {

  const scopes = Array.isArray(impactScope)

    ? impactScope

    : String(impactScope || '')

        .split(',')

        .map((s) => s.trim())

        .filter(Boolean);



  if (!scopes.length) {

    return HOW_PHASE_TOOL_STEPS.map((s) => ({

      toolName: s.toolName,

      autoConfirm: s.toolName === 'ProjectPlanTool' ? false : Boolean(s.autoConfirm),

    }));

  }



  const toolNames = [];

  const seen = new Set();

  for (const scope of scopes) {

    const tools =

      SCOPE_TO_TOOLS[scope] || SCOPE_TO_TOOLS[String(scope).toLowerCase()] || [];

    for (const name of tools) {

      if (seen.has(name)) continue;

      seen.add(name);

      toolNames.push(name);

    }

  }



  const steps = resolveStepsForToolNames(toolNames);

  return steps.length

    ? steps

    : HOW_PHASE_TOOL_STEPS.map((s) => ({

        toolName: s.toolName,

        autoConfirm: s.toolName === 'ProjectPlanTool' ? false : Boolean(s.autoConfirm),

      }));

}



module.exports = {

  resolveToolsForImpactScope,

  SCOPE_TO_TOOLS,

};

