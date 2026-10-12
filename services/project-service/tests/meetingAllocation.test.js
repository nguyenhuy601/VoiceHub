/**
 * AllocationEngine — dedup Plan/Event, capacity, workload (pure).
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeMeetingDemandForWeek,
  participantPlannedHours,
  planExceedWarning,
  availableCapacityHours,
  workloadPct,
  aggregateMeetingDemandBySubjectWeek,
  computeUserWeekWorkload,
} = require('../src/engines/allocation');

describe('dedupePlanEvent', () => {
  it('does not double-count plan + scheduled', () => {
    const d = computeMeetingDemandForWeek({
      planBudgetHours: 2,
      events: [{ status: 'scheduled', plannedHours: 2 }],
    });
    assert.equal(d.forecastDemandMeet, 2);
    assert.equal(d.unallocatedForecast, 0);
    assert.equal(d.scheduledHours, 2);
  });

  it('returns residual forecast when partially scheduled', () => {
    const d = computeMeetingDemandForWeek({
      planBudgetHours: 2,
      events: [{ status: 'scheduled', plannedHours: 1 }],
    });
    assert.equal(d.forecastDemandMeet, 2);
    assert.equal(d.unallocatedForecast, 1);
  });

  it('cancelled does not cover plan (return_forecast)', () => {
    const d = computeMeetingDemandForWeek({
      planBudgetHours: 2,
      events: [{ status: 'cancelled', plannedHours: 2 }],
    });
    assert.equal(d.forecastDemandMeet, 2);
    assert.equal(d.unallocatedForecast, 2);
    assert.equal(d.cancelledHours, 2);
  });

  it('person-hours from duration', () => {
    const h = participantPlannedHours({
      startAt: '2026-10-12T03:00:00.000Z',
      endAt: '2026-10-12T04:00:00.000Z',
    });
    assert.equal(h, 1);
  });

  it('suggests change control when exceed >20%', () => {
    const w = planExceedWarning({
      planBudget: 2,
      forecastDemandMeet: 3,
      suggestChangePct: 20,
    });
    assert.equal(w.softWarn, true);
    assert.equal(w.suggestChangeControl, true);
  });
});

describe('capacity', () => {
  it('available capacity does not subtract meetings', () => {
    const cap = availableCapacityHours({
      weekKey: '2026-10-12',
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      holidays: [],
    });
    assert.ok(cap.availableHours >= 32 && cap.availableHours <= 40);
    assert.equal(cap.calculationBasis.ptoExcluded, true);
  });

  it('workload pct example 26/32', () => {
    const wl = workloadPct({ demandHours: 26, availableHours: 32 });
    assert.equal(wl.workloadPct, 81.25);
  });
});

describe('aggregate + user workload', () => {
  it('aggregates user meeting demand without external guests', () => {
    const rows = aggregateMeetingDemandBySubjectWeek({
      planLines: [{ weekKey: '2026-10-12', userId: 'u1', hours: 2 }],
      events: [
        {
          status: 'scheduled',
          startAt: '2026-10-13T03:00:00.000Z',
          endAt: '2026-10-13T04:00:00.000Z',
          weekKey: '2026-10-12',
          participants: [
            { userId: 'u1', isExternal: false },
            { isExternal: true, externalEmail: 'c@x.com' },
          ],
        },
      ],
    });
    const u = rows.find((r) => r.subject === 'user:u1');
    assert.ok(u);
    assert.equal(u.forecastDemandMeet, 2);
  });

  it('cross-project style overload on shared capacity', () => {
    const row = computeUserWeekWorkload({
      userId: 'ba1',
      weekKey: '2026-10-12',
      taskDemandHours: 28,
      meetingDemandHours: 8,
      calendar: { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] },
      hoursPerWeekDefault: 40,
      overloadWarnPct: 100,
    });
    assert.ok(row.demandHours === 36);
    assert.ok(row.workloadPct != null);
  });
});
