const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  appendStaffingAuditEvent,
  MAX_AUDIT_EVENTS,
} = require('../src/utils/aiPlanningStaffingAudit');

describe('aiPlanningStaffingAudit', () => {
  it('appends events and caps at MAX_AUDIT_EVENTS', () => {
    let overlay = { staffingAudit: { events: [] } };
    for (let i = 0; i < MAX_AUDIT_EVENTS + 5; i += 1) {
      overlay = appendStaffingAuditEvent(overlay, {
        action: 'discarded',
        userId: `user-${i}`,
        validationStatus: 'ok',
        deltaSnapshot: { hoursDeltaPct: i },
      });
    }
    assert.equal(overlay.staffingAudit.events.length, MAX_AUDIT_EVENTS);
    assert.equal(overlay.staffingAudit.events[0].userId, `user-${5}`);
    assert.equal(overlay.staffingAudit.events[MAX_AUDIT_EVENTS - 1].userId, `user-${24}`);
  });

  it('stringifies userId and preserves prior events', () => {
    const overlay = appendStaffingAuditEvent(
      { staffingAudit: { events: [{ action: 'approved', at: '2020-01-01', userId: 'u0' }] } },
      { action: 'discarded', userId: { toString: () => 'u1' }, validationStatus: 'warnings' }
    );
    assert.equal(overlay.staffingAudit.events.length, 2);
    assert.equal(overlay.staffingAudit.events[1].userId, 'u1');
    assert.equal(overlay.staffingAudit.events[1].validationStatus, 'warnings');
  });
});
