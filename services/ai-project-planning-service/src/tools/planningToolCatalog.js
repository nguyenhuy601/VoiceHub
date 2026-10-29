/**
 * Plain tool execute map for phase function-nodes (Wbs, Schedule, WhatFr, …).
 * HOW sec + WHAT section tools are NOT here — only Pattern B on phase graph.
 */

const { employeeMatching } = require('./employeeMatching');
const { requirementAnalysis } = require('./requirementAnalysis');
const { schedule } = require('./schedule');
const { sequencing } = require('./sequencing');
const { hierarchy } = require('./hierarchy');
const { insights } = require('./insights');
const { wbs } = require('./wbs');
const { backlogMap } = require('./backlogMap');
const { projectPlan } = require('./projectPlan');
const { whatFr } = require('./whatFr');
const { WHAT_FR_TOOL } = require('../whatSecs/sectionCatalog');
const {
  EmployeeMatchingTool,
  RequirementAnalysisTool,
  ScheduleTool,
  SequencingTool,
  HierarchyTool,
  InsightsTool,
  BacklogMapTool,
  WbsTool,
  ProjectPlanTool,
  WhatFrTool,
} = require('./schemas/toolSchemas');
const PLANNING_REQUIRES = ['approvedSrs'];

/** @type {Readonly<Record<string, object>>} */
const PLANNING_TOOLS = Object.freeze({
  EmployeeMatchingTool: {
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
  },
  SequencingTool: {
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
  },
  RequirementAnalysisTool: {
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
  },
  ScheduleTool: {
    toolName: 'ScheduleTool',
    version: '1.0.0',
    description:
      'Capacity timeline + Sprint HOW (LLM Story→Sprint) + optional release naming',
    allowedContexts: ['planning'],
    requires: ['approvedSrs', 'calendarSnapshot'],
    // Sprint/Releases LLM can exceed 60s; align with WBS-scale HOW tool budgets.
    timeout: Number(process.env.HOW_SCHEDULE_TOOL_TIMEOUT_MS) || 600_000,
    inputSchema: ScheduleTool.inputSchema,
    outputSchema: ScheduleTool.outputSchema,
    evidenceSchema: ScheduleTool.evidenceSchema,
    execute: (input, ctx) => schedule(input || {}, ctx),
  },
  HierarchyTool: {
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
  },
  InsightsTool: {
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
  },
  BacklogMapTool: {
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
  },
  WbsTool: {
    toolName: 'WbsTool',
    version: '3.0.0',
    description:
      'LLM-only WBS: Story SoT + semantic → Task leaves (parentStoryId); materialize epic+story+task',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: Number(process.env.HOW_WBS_TOOL_TIMEOUT_MS) || 300_000,
    inputSchema: WbsTool.inputSchema,
    outputSchema: WbsTool.outputSchema,
    evidenceSchema: WbsTool.evidenceSchema,
    execute: (input, ctx) => wbs(input || {}, ctx),
  },
  ProjectPlanTool: {
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
  },
  [WHAT_FR_TOOL]: {
    toolName: WHAT_FR_TOOL,
    version: '1.0.0',
    description: 'WHAT FR: CR propose, FR semantic, and decompose',
    allowedContexts: ['understanding', 'planning'],
    requires: [],
    timeout: 300_000,
    inputSchema: WhatFrTool.inputSchema,
    outputSchema: WhatFrTool.outputSchema,
    evidenceSchema: WhatFrTool.evidenceSchema,
    execute: (input, ctx) => whatFr(input || {}, ctx),
  },
});

function getPlanningTool(toolName) {
  return PLANNING_TOOLS[String(toolName || '')] || null;
}

function listPlanningTools() {
  return Object.values(PLANNING_TOOLS).map(({ execute, ...rest }) => rest);
}

module.exports = {
  PLANNING_TOOLS,
  getPlanningTool,
  listPlanningTools,
};
