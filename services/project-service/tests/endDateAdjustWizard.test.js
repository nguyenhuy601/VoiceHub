const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { previewEventsAffectedByEndDate } = require('../src/utils/meeting/endDateAdjustWizard');

describe('endDateAdjustWizard', () => {
  it('keeps completed and flags future beyond new end', () => {
    const r = previewEventsAffectedByEndDate({
      newEndDate: '2026-10-20',
      events: [
        {
          id: '1',
          status: 'completed',
          startAt: '2026-11-01T10:00:00.000Z',
          title: 'Past done',
        },
        {
          id: '2',
          status: 'scheduled',
          startAt: '2026-10-25T10:00:00.000Z',
          title: 'Future',
        },
        {
          id: '3',
          status: 'scheduled',
          startAt: '2026-10-15T10:00:00.000Z',
          title: 'Keep',
        },
      ],
    });
    assert.equal(r.dropOrReschedule.length, 1);
    assert.equal(r.dropOrReschedule[0].eventId, '2');
    assert.ok(r.keep.some((e) => e.id === '1' && e.action === 'immutable_completed'));
  });
});
