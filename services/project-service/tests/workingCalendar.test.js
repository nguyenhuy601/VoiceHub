const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeWorkingCalendar,
  isCapacityDay,
  countWorkingDaysInRange,
  billingMonthCapacityHours,
  workingCapacityHoursInRange,
} = require('../src/utils/workingCalendar');
const { toDayMs } = require('../src/utils/allocationOverlap');

describe('workingCalendar', () => {
  it('defaults Mon-Fri 8h × 20 billing days = 160h', () => {
    const cal = normalizeWorkingCalendar({});
    assert.equal(cal.hoursPerDay, 8);
    assert.equal(cal.billingDaysPerMonth, 20);
    assert.equal(billingMonthCapacityHours(cal), 160);
  });

  it('excludes weekends from working days in Aug 2026 (partial week)', () => {
    const cal = normalizeWorkingCalendar({});
    const from = toDayMs('2026-08-01');
    const to = toDayMs('2026-08-07');
    const days = countWorkingDaysInRange(from, to, cal, []);
    assert.equal(days, 5);
    assert.equal(isCapacityDay(toDayMs('2026-08-08'), cal, []), false);
  });

  it('excludes org holidays', () => {
    const cal = normalizeWorkingCalendar({});
    const holiday = { date: '2026-08-05' };
    const wed = toDayMs('2026-08-05');
    assert.equal(isCapacityDay(wed, cal, [holiday]), false);
    const from = toDayMs('2026-08-03');
    const to = toDayMs('2026-08-07');
    assert.equal(countWorkingDaysInRange(from, to, cal, [holiday]), 4);
    assert.equal(
      workingCapacityHoursInRange({ fromMs: from, toMs: to, calendar: cal, holidays: [holiday] }),
      32
    );
  });
});
