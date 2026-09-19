const { registerTool } = require('../registry/toolRegistry');
const { employeeMatching } = require('./employeeMatching');
const { effort } = require('./effort');
const { requirementAnalysis } = require('./requirementAnalysis');
const { schedule } = require('./schedule');
const { architecture } = require('./architecture');
const { risk } = require('./risk');

let registered = false;

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
    execute: (input, ctx) => employeeMatching(input || {}, ctx),
  });

  registerTool({
    toolName: 'EffortTool',
    version: '1.0.0',
    description: 'Estimate effort hours for WBS tasks',
    allowedContexts: ['planning'],
    requires: ['approvedSrs'],
    timeout: 30_000,
    execute: (input, ctx) => effort(input || {}, ctx),
  });

  registerTool({
    toolName: 'RequirementAnalysisTool',
    version: '1.0.0',
    description: 'Structured requirement extract from snapshot',
    allowedContexts: ['planning', 'understanding'],
    requires: ['approvedSrs'],
    timeout: 30_000,
    execute: (input, ctx) => requirementAnalysis(input || {}, ctx),
  });

  registerTool({
    toolName: 'ScheduleTool',
    version: '1.0.0',
    description: 'Build schedule / capacity timeline',
    allowedContexts: ['planning'],
    requires: ['approvedSrs', 'calendarSnapshot'],
    timeout: 60_000,
    execute: (input, ctx) => schedule(input || {}, ctx),
  });

  registerTool({
    toolName: 'ArchitectureTool',
    version: '1.0.0',
    description: 'Architecture component/dependency stub',
    allowedContexts: ['planning'],
    requires: ['approvedSrs'],
    timeout: 30_000,
    execute: (input, ctx) => architecture(input || {}, ctx),
  });

  registerTool({
    toolName: 'RiskTool',
    version: '1.0.0',
    description: 'Risk identification stub',
    allowedContexts: ['planning'],
    requires: ['approvedSrs'],
    timeout: 30_000,
    execute: (input, ctx) => risk(input || {}, ctx),
  });
}

function _resetRegisteredForTests() {
  registered = false;
}

module.exports = { registerDefaultTools, _resetRegisteredForTests };
