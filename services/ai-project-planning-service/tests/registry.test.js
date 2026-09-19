const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const {
  clearRegistry,
  resolveTool,
  registerTool,
} = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');

describe('toolRegistry', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  it('rejects unknown tool', () => {
    assert.throws(
      () => resolveTool('TotallyUnknownTool', { approvedSrs: true }),
      (err) => err.code === 'TOOL_NOT_REGISTERED'
    );
  });

  it('rejects missing requires', () => {
    assert.throws(
      () => resolveTool('EmployeeMatchingTool', { contextName: 'planning' }),
      (err) => err.code === 'TOOL_REQUIRES_MISSING'
    );
  });

  it('resolves registered tool when requires satisfied', () => {
    const tool = resolveTool('EmployeeMatchingTool', {
      contextName: 'planning',
      approvedSrs: true,
      employeeSnapshot: {},
    });
    assert.equal(tool.toolName, 'EmployeeMatchingTool');
  });

  it('can register ad-hoc tool', () => {
    registerTool({
      toolName: 'AdHocTestTool',
      version: '0.0.1',
      allowedContexts: ['planning'],
      requires: [],
      execute: async () => ({ result: {}, evidence: [] }),
    });
    assert.ok(resolveTool('AdHocTestTool', { contextName: 'planning' }));
  });
});
