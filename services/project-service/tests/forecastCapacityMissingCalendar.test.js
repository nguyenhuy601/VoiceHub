const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { availableCapacityHours } = require('../src/engines/allocation/capacity');
const { buildAvailableHoursByWeek } = require('../src/engines/allocation/forecastDemand');

describe('availableCapacityHours missing calendar', () => {
  it('does not silently default 40h when requireCalendar and no calendar', () => {
    const cap = availableCapacityHours({
      weekKey: '2026-10-05',
      calendar: {},
      requireCalendar: true,
    });
    assert.equal(cap.capacityStatus, 'missing_calendar');
    assert.equal(cap.availableHours, null);
  });

  it('returns hours when calendar provided', () => {
    const cap = availableCapacityHours({
      weekKey: '2026-10-05',
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      requireCalendar: true,
    });
    assert.equal(cap.capacityStatus, 'ok');
    assert.equal(cap.availableHours, 40);
  });
});

describe('buildAvailableHoursByWeek', () => {
  it('nulls weeks when requireCalendar without calendar', () => {
    const map = buildAvailableHoursByWeek(['2026-10-05'], {
      calendar: {},
      requireCalendar: true,
    });
    assert.equal(map['2026-10-05'], null);
  });
});
