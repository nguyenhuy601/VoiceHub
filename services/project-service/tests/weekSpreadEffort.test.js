const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  spreadHoursAcrossWeeks,
  spreadHoursPerWeekAcrossPhase,
} = require('../src/engines/allocation/weekSpread');

const CAL = { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] };

describe('spreadHoursAcrossWeeks', () => {
  it('sums to totalHours across weeks (not full hours each week)', () => {
    const map = spreadHoursAcrossWeeks({
      totalHours: 10,
      startDate: '2026-10-05',
      endDate: '2026-10-16',
      calendar: CAL,
    });
    const keys = Object.keys(map);
    assert.ok(keys.length >= 2);
    const sum = Object.values(map).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 10) < 0.02);
    for (const h of Object.values(map)) {
      assert.ok(h < 10);
    }
  });

  it('single day puts all hours in one week', () => {
    const map = spreadHoursAcrossWeeks({
      totalHours: 8,
      startDate: '2026-10-07',
      endDate: '2026-10-07',
      calendar: CAL,
    });
    assert.equal(Object.keys(map).length, 1);
    assert.equal(Object.values(map)[0], 8);
  });
});

describe('spreadHoursPerWeekAcrossPhase', () => {
  it('applies hoursPerWeek to each week in phase', () => {
    const map = spreadHoursPerWeekAcrossPhase({
      hoursPerWeek: 12,
      phaseStartDate: '2026-10-05',
      phaseEndDate: '2026-10-25',
      calendar: CAL,
    });
    assert.ok(Object.keys(map).length >= 2);
    for (const h of Object.values(map)) {
      assert.equal(h, 12);
    }
  });
});
