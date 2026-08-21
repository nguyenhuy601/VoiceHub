const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeUserRangeCapacity,
  countHolidaysInRange,
  buildWindowMeta,
} = require('../src/utils/rangeCapacityMath');
const { toDayMs, flattenSegments } = require('../src/utils/allocationOverlap');
const { normalizeWorkingCalendar } = require('../src/utils/workingCalendar');

const cal = normalizeWorkingCalendar({});

describe('rangeCapacityMath', () => {
  it('T1: 5 weekdays, 0 allocation → gross=40h, available=40h', () => {
    const fromMs = toDayMs('2026-08-03'); // Mon
    const toMs = toDayMs('2026-08-07'); // Fri
    const r = computeUserRangeCapacity({
      flatSegments: [],
      fromMs,
      toMs,
      calendar: cal,
      holidays: [],
    });
    assert.equal(r.workingDays, 5);
    assert.equal(r.grossHours, 40);
    assert.equal(r.allocatedHours, 0);
    assert.equal(r.availableHours, 40);
    assert.equal(r.peakAllocatedPct, 0);
    assert.equal(r.avgAvailablePct, 100);
    assert.equal(r.availability, 'available');
  });

  it('T2: 1 org holiday in range → workingDays -1', () => {
    const fromMs = toDayMs('2026-08-03');
    const toMs = toDayMs('2026-08-07');
    const holidays = [{ date: '2026-08-05' }]; // Wed
    const r = computeUserRangeCapacity({
      flatSegments: [],
      fromMs,
      toMs,
      calendar: cal,
      holidays,
    });
    assert.equal(r.workingDays, 4);
    assert.equal(r.grossHours, 32);
    assert.equal(countHolidaysInRange(fromMs, toMs, cal, holidays), 1);
  });

  it('T3: 50% allocation whole range → availableHours = gross/2', () => {
    const fromMs = toDayMs('2026-08-03');
    const toMs = toDayMs('2026-08-07');
    const flat = flattenSegments([
      {
        allocations: [
          { startDate: '2026-08-01', endDate: '2026-08-31', allocationPct: 50 },
        ],
      },
    ]);
    const r = computeUserRangeCapacity({
      flatSegments: flat,
      fromMs,
      toMs,
      calendar: cal,
      holidays: [],
    });
    assert.equal(r.grossHours, 40);
    assert.equal(r.allocatedHours, 20);
    assert.equal(r.availableHours, 20);
    assert.equal(r.peakAllocatedPct, 50);
    assert.equal(r.avgAvailablePct, 50);
    assert.equal(r.availability, 'partial');
  });

  it('T4: segment covers half range → peak vs avg differ', () => {
    // Mon–Fri week; allocate 100% only Mon–Tue
    const fromMs = toDayMs('2026-08-03');
    const toMs = toDayMs('2026-08-07');
    const flat = flattenSegments([
      {
        allocations: [
          { startDate: '2026-08-03', endDate: '2026-08-04', allocationPct: 100 },
        ],
      },
    ]);
    const r = computeUserRangeCapacity({
      flatSegments: flat,
      fromMs,
      toMs,
      calendar: cal,
      holidays: [],
    });
    assert.equal(r.workingDays, 5);
    assert.equal(r.grossHours, 40);
    assert.equal(r.allocatedHours, 16); // 2 days × 8h
    assert.equal(r.availableHours, 24);
    assert.equal(r.peakAllocatedPct, 100);
    assert.equal(r.avgAvailablePct, 60);
    assert.equal(r.availability, 'partial');
  });

  it('peak > 100% → overallocated', () => {
    const day = toDayMs('2026-08-05');
    const flat = flattenSegments([
      {
        allocations: [
          { startDate: '2026-08-05', endDate: '2026-08-05', allocationPct: 60 },
        ],
      },
      {
        allocations: [
          { startDate: '2026-08-05', endDate: '2026-08-05', allocationPct: 50 },
        ],
      },
    ]);
    const r = computeUserRangeCapacity({
      flatSegments: flat,
      fromMs: day,
      toMs: day,
      calendar: cal,
      holidays: [],
    });
    assert.equal(r.peakAllocatedPct, 110);
    assert.equal(r.availability, 'overallocated');
    assert.equal(r.grossHours, 8);
    assert.equal(r.allocatedHours, 8.8);
    assert.equal(r.availableHours, 0); // clamped
  });

  it('excludes weekends from capacity', () => {
    const fromMs = toDayMs('2026-08-01'); // Sat
    const toMs = toDayMs('2026-08-02'); // Sun
    const r = computeUserRangeCapacity({
      flatSegments: [],
      fromMs,
      toMs,
      calendar: cal,
      holidays: [],
    });
    assert.equal(r.workingDays, 0);
    assert.equal(r.grossHours, 0);
  });

  it('buildWindowMeta', () => {
    const fromMs = toDayMs('2026-08-03');
    const toMs = toDayMs('2026-08-07');
    const meta = buildWindowMeta({
      fromMs,
      toMs,
      calendar: cal,
      holidays: [{ date: '2026-08-05' }],
    });
    assert.equal(meta.from, '2026-08-03');
    assert.equal(meta.to, '2026-08-07');
    assert.equal(meta.workingDays, 4);
    assert.equal(meta.hoursPerDay, 8);
    assert.equal(meta.holidayCountInRange, 1);
  });
});
