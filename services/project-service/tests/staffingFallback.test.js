const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyStaffingFallback,
  remainingCalendarDays,
  isSelectiveAuditAction,
  SELECTIVE_AUDIT_ACTIONS,
} = require('../src/utils/task/staffingFallback');

describe('staffingFallback Wave 5', () => {
  const now = new Date('2026-08-10T12:00:00.000Z');

  it('fail_short_horizon when remaining < 1 day', () => {
    assert.equal(
      classifyStaffingFallback(
        { dueDate: '2026-08-10T00:00:00.000Z', status: 'todo', isActive: true },
        { now }
      ),
      'fail_short_horizon'
    );
    assert.equal(
      classifyStaffingFallback(
        { dueDate: '2026-08-09T00:00:00.000Z', status: 'in_progress', isActive: true },
        { now }
      ),
      'fail_short_horizon'
    );
  });

  it('suggest_replace when ≥ 1 day remaining', () => {
    assert.equal(
      classifyStaffingFallback(
        { dueDate: '2026-08-12T00:00:00.000Z', status: 'todo', isActive: true },
        { now }
      ),
      'suggest_replace'
    );
    assert.equal(remainingCalendarDays({ dueDate: '2026-08-12T00:00:00.000Z' }, now), 2);
  });

  it('null when done/cancelled or no due', () => {
    assert.equal(
      classifyStaffingFallback({ dueDate: '2026-08-12', status: 'done', isActive: true }, { now }),
      null
    );
    assert.equal(classifyStaffingFallback({ status: 'todo', isActive: true }, { now }), null);
  });

  it('selective audit whitelist includes Wave 5 actions', () => {
    assert.ok(SELECTIVE_AUDIT_ACTIONS.includes('task_reassign'));
    assert.ok(SELECTIVE_AUDIT_ACTIONS.includes('fallback_override'));
    assert.ok(SELECTIVE_AUDIT_ACTIONS.includes('failed_short_horizon'));
    assert.ok(SELECTIVE_AUDIT_ACTIONS.includes('re_estimate_hours'));
    assert.ok(isSelectiveAuditAction('sprint_extend'));
    assert.equal(isSelectiveAuditAction('random_http'), false);
  });
});
