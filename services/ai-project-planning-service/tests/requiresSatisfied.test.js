const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { clearRegistry, invokeTool } = require('../src/registry/toolRegistry');
const {
  registerDefaultTools,
  _resetRegisteredForTests,
} = require('../src/tools/registerDefaultTools');
const {
  buildToolContext,
  runToolsSequence,
} = require('../src/orchestration/runToolsSequence');

describe('requiresSatisfied (RULE-AUD-03)', () => {
  before(() => {
    clearRegistry();
    _resetRegisteredForTests();
    registerDefaultTools();
  });

  it('buildToolContext marks employeeSnapshot false when employees absent', () => {
    const ctx = buildToolContext({
      pack: { overview: { startDate: '2026-01-01' } },
      toolData: {},
      container: { resource: {} },
    });
    assert.equal(ctx.requiresSatisfied.employeeSnapshot, false);
    assert.equal(ctx.requiresSatisfied.calendarSnapshot, true);
    assert.equal(ctx.employeeSnapshot, undefined);
  });

  it('buildToolContext marks calendarSnapshot false when no startDate/calendar', () => {
    const ctx = buildToolContext({
      pack: {},
      toolData: { employees: [] },
      container: {},
    });
    assert.equal(ctx.requiresSatisfied.employeeSnapshot, true);
    assert.equal(ctx.requiresSatisfied.calendarSnapshot, false);
  });

  it('EmployeeMatchingTool throws TOOL_REQUIRES_MISSING without employees', async () => {
    await assert.rejects(
      () =>
        runToolsSequence([{ toolName: 'EmployeeMatchingTool', autoConfirm: false }], {
          container: { planning: { tasks: [] }, resource: {}, analyses: {} },
          pack: { overview: { startDate: '2026-01-01' } },
          toolData: {},
        }),
      (err) => err.code === 'TOOL_REQUIRES_MISSING' && err.missing === 'employeeSnapshot'
    );
  });

  it('ScheduleTool throws TOOL_REQUIRES_MISSING without calendar snapshot', async () => {
    await assert.rejects(
      () =>
        invokeTool(
          'ScheduleTool',
          {},
          {
            contextName: 'planning',
            approvedSrs: true,
            requiresSatisfied: { approvedSrs: true, calendarSnapshot: false },
          }
        ),
      (err) => err.code === 'TOOL_REQUIRES_MISSING' && err.missing === 'calendarSnapshot'
    );
  });
});
