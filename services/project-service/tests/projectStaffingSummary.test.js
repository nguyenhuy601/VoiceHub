const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { summarizeProjectRoleStaffing } = require('../src/utils/projectStaffingSummary');

describe('summarizeProjectRoleStaffing', () => {
  it('computes remaining headcount from unique users', () => {
    const summary = summarizeProjectRoleStaffing(
      [{ roleKey: 'developer', requiredCount: 2 }],
      [{ userId: 'u1', projectRoleKey: 'developer' }],
      'developer'
    );
    assert.deepEqual(summary, {
      roleKey: 'developer',
      requiredCount: 2,
      currentCount: 1,
      remainingCount: 1,
      isFilled: false,
    });
  });

  it('marks role as filled when current meets required', () => {
    const summary = summarizeProjectRoleStaffing(
      [{ roleKey: 'developer', requiredCount: 1 }],
      [
        { userId: 'u1', projectRoleKey: 'developer' },
        { userId: 'u1', projectRoleKey: 'developer' },
        { userId: 'u2', projectRoleKey: 'qa' },
      ],
      'developer'
    );
    assert.equal(summary.currentCount, 1);
    assert.equal(summary.remainingCount, 0);
    assert.equal(summary.isFilled, true);
  });
});
