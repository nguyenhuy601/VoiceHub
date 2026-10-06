const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildBookedHoursByUserDay,
  summarizeBookedHoursQuality,
} = require('../src/utils/staffing/buildBookedHoursByUserDay');
const { toDayMs } = require('../src/utils/staffing/allocationOverlap');

describe('buildBookedHoursByUserDay', () => {
  it('maps allocation pct × hoursPerDay on capacity days only', () => {
    const fromMs = toDayMs('2026-09-07'); // Monday
    const toMs = toDayMs('2026-09-09'); // Wednesday
    const map = buildBookedHoursByUserDay({
      users: [
        {
          userId: 'u1',
          flatSegments: [
            {
              startMs: fromMs,
              endMs: toMs,
              pct: 50,
            },
          ],
        },
      ],
      fromMs,
      toMs,
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      holidays: [],
    });
    assert.equal(map['u1|2026-09-07'], 4);
    assert.equal(map['u1|2026-09-08'], 4);
    assert.equal(map['u1|2026-09-09'], 4);
  });

  it('returns empty map when no allocation segments (no invent)', () => {
    const fromMs = toDayMs('2026-09-07');
    const toMs = toDayMs('2026-09-10');
    const map = buildBookedHoursByUserDay({
      users: [{ userId: 'u1', flatSegments: [] }],
      fromMs,
      toMs,
      calendar: { hoursPerDay: 8 },
      holidays: [],
    });
    assert.deepEqual(map, {});
  });

  it('skips holidays and non-working days', () => {
    const fromMs = toDayMs('2026-09-05'); // Saturday
    const toMs = toDayMs('2026-09-08'); // Tuesday; Mon holiday
    const map = buildBookedHoursByUserDay({
      users: [
        {
          userId: 'u2',
          flatSegments: [{ startMs: fromMs, endMs: toMs, pct: 100 }],
        },
      ],
      fromMs,
      toMs,
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      holidays: [{ date: '2026-09-07' }],
    });
    assert.equal(map['u2|2026-09-05'], undefined);
    assert.equal(map['u2|2026-09-06'], undefined);
    assert.equal(map['u2|2026-09-07'], undefined);
    assert.equal(map['u2|2026-09-08'], 8);
  });

  it('returns empty when window invalid', () => {
    assert.deepEqual(
      buildBookedHoursByUserDay({
        users: [{ userId: 'u1', flatSegments: [{ startMs: 0, endMs: 1, pct: 50 }] }],
        fromMs: null,
        toMs: null,
      }),
      {}
    );
  });

  it('summarizeBookedHoursQuality reports status without inventing', () => {
    assert.deepEqual(
      summarizeBookedHoursQuality({ bookedHoursByUserDay: null, hadPlanningWindow: false }),
      { bookedHoursDaysCount: 0, bookedHoursStatus: 'no_window' }
    );
    assert.deepEqual(
      summarizeBookedHoursQuality({ bookedHoursByUserDay: {}, hadPlanningWindow: true }),
      { bookedHoursDaysCount: 0, bookedHoursStatus: 'no_allocation' }
    );
    const q = summarizeBookedHoursQuality({
      bookedHoursByUserDay: { 'u1|2026-09-07': 4 },
      hadPlanningWindow: true,
    });
    assert.equal(q.bookedHoursStatus, 'ok');
    assert.equal(q.bookedHoursDaysCount, 1);
  });
});
