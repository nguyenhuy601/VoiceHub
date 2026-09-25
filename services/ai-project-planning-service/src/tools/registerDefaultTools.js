const { registerTool } = require('../registry/toolRegistry');
const { employeeMatching } = require('./employeeMatching');
const { effort } = require('./effort');
const { requirementAnalysis } = require('./requirementAnalysis');
const { schedule } = require('./schedule');
const { architecture } = require('./architecture');
const { risk } = require('./risk');
const { sequencing } = require('./sequencing');
const { hierarchy } = require('./hierarchy');
const { capability } = require('./capability');
const { insights } = require('./insights');
const { wbs } = require('./wbs');
const { dependency } = require('./dependency');
const { projectPlan } = require('./projectPlan');
const {
  EmployeeMatchingTool,
  EffortTool,
  RequirementAnalysisTool,
  ScheduleTool,
  ArchitectureTool,
  RiskTool,
  SequencingTool,
  HierarchyTool,
  CapabilityTool,
  InsightsTool,
  WbsTool,
  DependencyTool,
  ProjectPlanTool,
} = require('./schemas/toolSchemas');

let registered = false;

const PLANNING_REQUIRES = ['approvedSrs'];

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
    timeout: 30_000,
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
    timeout: 60_000,
    inputSchema: ScheduleTool.inputSchema,
    outputSchema: ScheduleTool.outputSchema,
    evidenceSchema: ScheduleTool.evidenceSchema,
    execute: (input, ctx) => schedule(input || {}, ctx),
  });

  registerTool({
    toolName: 'ArchitectureTool',
    version: '1.0.0',
    description: 'Architecture component/dependency analysis',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 30_000,
    inputSchema: ArchitectureTool.inputSchema,
    outputSchema: ArchitectureTool.outputSchema,
    evidenceSchema: ArchitectureTool.evidenceSchema,
    execute: (input, ctx) => architecture(input || {}, ctx),
  });

  registerTool({
    toolName: 'RiskTool',
    version: '1.0.0',
    description: 'Risk identification',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 30_000,
    inputSchema: RiskTool.inputSchema,
    outputSchema: RiskTool.outputSchema,
    evidenceSchema: RiskTool.evidenceSchema,
    execute: (input, ctx) => risk(input || {}, ctx),
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
    toolName: 'CapabilityTool',
    version: '1.0.0',
    description: 'Capability analysis from SRS / hierarchy',
    allowedContexts: ['planning', 'understanding'],
    requires: [],
    timeout: 30_000,
    inputSchema: CapabilityTool.inputSchema,
    outputSchema: CapabilityTool.outputSchema,
    evidenceSchema: CapabilityTool.evidenceSchema,
    execute: (input, ctx) => capability(input || {}, ctx),
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
    toolName: 'WbsTool',
    version: '1.0.0',
    description: 'WBS generation from analyses',
    allowedContexts: ['planning'],
    requires: PLANNING_REQUIRES,
    timeout: 30_000,
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
    timeout: 30_000,
    inputSchema: DependencyTool.inputSchema,
    outputSchema: DependencyTool.outputSchema,
    evidenceSchema: DependencyTool.evidenceSchema,
    execute: (input, ctx) => dependency(input || {}, ctx),
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

module.exports = { registerDefaultTools, _resetRegisteredForTests };
