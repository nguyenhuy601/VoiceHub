const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  deriveFeasibilityFlags,
} = require('../src/validation/deriveFeasibilityFlags');
const { checkFeasibility } = require('../src/validation/feasibility');

describe('deriveFeasibilityFlags', () => {
  it('fails resource when matching overload present after EmployeeMatchingTool', () => {
    const flags = deriveFeasibilityFlags({
      toolResults: [{ toolName: 'EmployeeMatchingTool' }],
      container: {
        planning: { tasks: [{ id: 'T1' }] },
        resource: { matching: { overload: [{ userId: 'u1' }], unassigned: [] } },
      },
    });
    assert.equal(flags.resourceOk, false);
    assert.equal(flags.coverageOk, true);
    const feas = checkFeasibility({ snapshotId: 'SNAP-1', ...flags });
    assert.equal(feas.pass, false);
    assert.ok(feas.failures.some((f) => f.code === 'FEAS_RESOURCE'));
  });

  it('passes when tools ran clean', () => {
    const flags = deriveFeasibilityFlags({
      toolResults: [
        { toolName: 'WbsTool' },
        { toolName: 'EmployeeMatchingTool' },
        { toolName: 'ScheduleTool' },
      ],
      container: {
        planning: { tasks: [{ id: 'T1' }], schedule: { conflicts: [] } },
        resource: { matching: { overload: [], unassigned: [] } },
      },
    });
    assert.equal(flags.coverageOk, true);
    assert.equal(flags.resourceOk, true);
    assert.equal(flags.scheduleOk, true);
    assert.equal(checkFeasibility(flags).pass, true);
  });
});
