const { registerTool } = require('../registry/toolRegistry');
const { employeeMatching } = require('./employeeMatching');
const { effort } = require('./effort');
const { requirementAnalysis } = require('./requirementAnalysis');
const { schedule } = require('./schedule');
const { risk } = require('./risk');
const { sequencing } = require('./sequencing');
const { hierarchy } = require('./hierarchy');
const { insights } = require('./insights');
const { wbs } = require('./wbs');
const { backlogMap } = require('./backlogMap');
const { dependency } = require('./dependency');
const { architecture } = require('./architecture');
const { projectPlan } = require('./projectPlan');
const { qualityPlan } = require('./qualityPlan');
const { resolveQualityToolTimeoutMs } = require('../howSecs/quality/qualityGraph');
const { deployPlan } = require('./deployPlan');
const { runWhatSectionTool } = require('./whatSection');
const { whatFr } = require('./whatFr');
const { WHAT_SECTION_TOOLS, WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
const {
  EmployeeMatchingTool,
  EffortTool,
  RequirementAnalysisTool,
  ScheduleTool,
  RiskTool,
  SequencingTool,
  HierarchyTool,
  InsightsTool,
  BacklogMapTool,
  WbsTool,
  DependencyTool,
  ArchitectureTool,
  ProjectPlanTool,
  QualityPlanTool,
  DeployPlanTool,
  WhatSectionTool,
  WhatFrTool,
} = require('./schemas/toolSchemas');

let registered = false;

const PLANNING_REQUIRES = ['approvedSrs'];

/**
 * howSecs LLM graphs call invokeHowSemanticLlm at 90s.
 * A 30s tool wrapper rejects with TOOL_TIMEOUT before Accept writes the section.
 */
const HOW_SEC_LLM_TOOL_TIMEOUT_MS = 120_000;

function registerDefaultTools() {
  if (registered) return;
  registered = true;

  registerTool({
    toolName: 'EmployeeMatchingTool',
    version: '1.0.0',
    description: 'Score employee candidates against role/skill needs',
    allowedContexts: ['planning'],
    requires: ['approvedSrs', 'employeeSnapshot'],
    timeout: 60_000,
    inputSchema: EmployeeMatchingTool.inputSchema,
    outputSchema: EmployeeMatchingTool.outputSchema,
    evidenceSchema: EmployeeMatchingTool.evidenceSchema,
    execute: (input, ctx) => employeeMatching(input || {}, ctx),
  });

  registerTool({
    toolName: 'EffortTool',
    version: '1.1.0',
    description: 'Role/skill planning + effort hours for WBS tasks',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: EffortTool.inputSchema,
    outputSchema: EffortTool.outputSchema,
    evidenceSchema: EffortTool.evidenceSchema,
    execute: (input, ctx) => effort(input || {}, ctx),
  });

  registerTool({
    toolName: 'SequencingTool',
    version: '1.0.0',
    description: 'CPM sequencing / critical path',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 30_000,
    inputSchema: SequencingTool.inputSchema,
    outputSchema: SequencingTool.outputSchema,
    evidenceSchema: SequencingTool.evidenceSchema,
    execute: (input, ctx) => sequencing(input || {}, ctx),
  });

  registerTool({
    toolName: 'RequirementAnalysisTool',
    version: '1.2.0',
    description: 'Structured requirement extract + hierarchy/dependency candidates',
    allowedContexts: ['planning', 'understanding'],
    requires: [],
    timeout: 60_000,
    inputSchema: RequirementAnalysisTool.inputSchema,
    outputSchema: RequirementAnalysisTool.outputSchema,
    evidenceSchema: RequirementAnalysisTool.evidenceSchema,
    execute: (input, ctx) => requirementAnalysis(input || {}, ctx),
  });

  registerTool({
    toolName: 'ScheduleTool',
    version: '1.0.0',
    description: 'Build schedule / capacity timeline',
    allowedContexts: ['planning'],
    requires: ['approvedSrs', 'calendarSnapshot'],
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: ScheduleTool.inputSchema,
    outputSchema: ScheduleTool.outputSchema,
    evidenceSchema: ScheduleTool.evidenceSchema,
    execute: (input, ctx) => schedule(input || {}, ctx),
  });

  registerTool({
    toolName: 'RiskTool',
    version: '1.0.0',
    description: 'Risk identification',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: RiskTool.inputSchema,
    outputSchema: RiskTool.outputSchema,
    evidenceSchema: RiskTool.evidenceSchema,
    execute: (input, ctx) => risk(input || {}, ctx),
  });

  registerTool({
    toolName: 'QualityPlanTool',
    version: '1.0.0',
    description: 'Quality & testing plan from UC/AC/NFR + WBS (deterministic)',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    // Same wait as WbsTool: qwen-max slices outlive the 120s section wrapper.
    timeout: resolveQualityToolTimeoutMs(),
    inputSchema: QualityPlanTool.inputSchema,
    outputSchema: QualityPlanTool.outputSchema,
    evidenceSchema: QualityPlanTool.evidenceSchema,
    execute: (input, ctx) => qualityPlan(input || {}, ctx),
  });

  registerTool({
    toolName: 'DeployPlanTool',
    version: '1.0.0',
    description: 'Deploy/release plan from SNAP technical + schedule (plan-only, no CI execute)',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: DeployPlanTool.inputSchema,
    outputSchema: DeployPlanTool.outputSchema,
    evidenceSchema: DeployPlanTool.evidenceSchema,
    execute: (input, ctx) => deployPlan(input || {}, ctx),
  });

  registerTool({
    toolName: 'HierarchyTool',
    version: '1.0.0',
    description: 'Requirement hierarchy decomposition',
    allowedContexts: ['planning', 'understanding'],
    requires: [],
    timeout: 30_000,
    inputSchema: HierarchyTool.inputSchema,
    outputSchema: HierarchyTool.outputSchema,
    evidenceSchema: HierarchyTool.evidenceSchema,
    execute: (input, ctx) => hierarchy(input || {}, ctx),
  });

  registerTool({
    toolName: 'InsightsTool',
    version: '1.0.0',
    description: 'Requirement insights heuristics',
    allowedContexts: ['planning', 'understanding'],
    requires: [],
    timeout: 30_000,
    inputSchema: InsightsTool.inputSchema,
    outputSchema: InsightsTool.outputSchema,
    evidenceSchema: InsightsTool.evidenceSchema,
    execute: (input, ctx) => insights(input || {}, ctx),
  });

  registerTool({
    toolName: 'BacklogMapTool',
    version: '1.0.0',
    description: 'Map approved SRS to Agile backlog (Epic/Feature/Story-PBI)',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 30_000,
    inputSchema: BacklogMapTool.inputSchema,
    outputSchema: BacklogMapTool.outputSchema,
    evidenceSchema: BacklogMapTool.evidenceSchema,
    execute: (input, ctx) => backlogMap(input || {}, ctx),
  });

  registerTool({
    toolName: 'WbsTool',
    version: '3.0.0',
    description:
      'LLM-only WBS: Story SoT + semantic → Task leaves (parentStoryId); materialize epic+story+task',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    // WBS may wait on a queued LLM job. Default tool timeout is too short.
    timeout: Number(process.env.HOW_WBS_TOOL_TIMEOUT_MS) || 300_000,
    inputSchema: WbsTool.inputSchema,
    outputSchema: WbsTool.outputSchema,
    evidenceSchema: WbsTool.evidenceSchema,
    execute: (input, ctx) => wbs(input || {}, ctx),
  });

  registerTool({
    toolName: 'DependencyTool',
    version: '1.0.0',
    description: 'Task / requirement dependency graph',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: DependencyTool.inputSchema,
    outputSchema: DependencyTool.outputSchema,
    evidenceSchema: DependencyTool.evidenceSchema,
    execute: (input, ctx) => dependency(input || {}, ctx),
  });

  registerTool({
    toolName: 'ArchitectureTool',
    version: '1.0.0',
    description: 'Architecture impact from approved SRS and WBS leaves',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: HOW_SEC_LLM_TOOL_TIMEOUT_MS,
    inputSchema: ArchitectureTool.inputSchema,
    outputSchema: ArchitectureTool.outputSchema,
    evidenceSchema: ArchitectureTool.evidenceSchema,
    execute: (input, ctx) => architecture(input || {}, ctx),
  });

  for (const sec of WHAT_SECTION_TOOLS) {
    registerTool({
      toolName: sec.toolName,
      version: '1.0.0',
      description: `WHAT ${sec.engineId}: facts and accept are deterministic; LLM returns JSON only`,
      allowedContexts: ['understanding', 'planning'],
      requires: [],
      timeout: 300_000,
      inputSchema: WhatSectionTool.inputSchema,
      outputSchema: WhatSectionTool.outputSchema,
      evidenceSchema: WhatSectionTool.evidenceSchema,
      execute: (input, ctx) => runWhatSectionTool(sec.engineId, input || {}, ctx),
    });
  }

  registerTool({
    toolName: WHAT_FR_TOOL,
    version: '1.0.0',
    description: 'WHAT FR: CR propose, G4 semantic, and decompose. Graph node only invokes this tool.',
    allowedContexts: ['understanding', 'planning'],
    requires: [],
    timeout: 300_000,
    inputSchema: WhatFrTool.inputSchema,
    outputSchema: WhatFrTool.outputSchema,
    evidenceSchema: WhatFrTool.evidenceSchema,
    execute: (input, ctx) => whatFr(input || {}, ctx),
  });

  registerTool({
    toolName: 'ProjectPlanTool',
    version: '1.0.0',
    description: 'Assemble execution plan shell for Gate 2',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 15_000,
    inputSchema: ProjectPlanTool.inputSchema,
    outputSchema: ProjectPlanTool.outputSchema,
    evidenceSchema: ProjectPlanTool.evidenceSchema,
    execute: (input, ctx) => projectPlan(input || {}, ctx),
  });
}

function _resetRegisteredForTests() {
  registered = false;
}

module.exports = {
  registerDefaultTools,
  _resetRegisteredForTests,
  HOW_SEC_LLM_TOOL_TIMEOUT_MS,
};
