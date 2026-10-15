const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeForecastDemandByWeek,
  applyAllocateFromBudget,
  projectForecastWithDelta,
} = require('../src/engines/allocation/forecastDemand');

const CAL = { hoursPerDay: 8, workingDayIndexes: [1, 2, 3, 4, 5] };

describe('applyAllocateFromBudget', () => {
  it('reduces residual when allocating to task/meeting', () => {
    const r = applyAllocateFromBudget({
      hoursPerWeek: 12,
      residualHoursPerWeek: 12,
      allocateHours: 5,
    });
    assert.equal(r.ok, true);
    assert.equal(r.residualHoursPerWeek, 7);
  });

  it('rejects allocate above residual', () => {
    const r = applyAllocateFromBudget({
      hoursPerWeek: 12,
      residualHoursPerWeek: 3,
      allocateHours: 5,
    });
    assert.equal(r.ok, false);
  });
});

describe('computeForecastDemandByWeek anti-dup', () => {
  it('budget 12 residual after allocate 5+3 → unallocated 4; with task5 meet3 total 12 not 20', () => {
    const budgets = [
      {
        residualHoursPerWeek: 4,
        hoursPerWeek: 12,
        phaseStartDate: '2026-10-05',
        phaseEndDate: '2026-10-11',
      },
    ];
    const tasks = [{ effortHours: 5, startDate: '2026-10-06', dueDate: '2026-10-10' }];
    const meetings = [{ hours: 3, weekKey: '2026-10-05' }];
    const { byWeek, totals } = computeForecastDemandByWeek({
      budgets,
      tasks,
      meetings,
      calendar: CAL,
    });
    const week = byWeek['2026-10-05'];
    assert.ok(week);
    assert.equal(week.unallocatedBudgetHours, 4);
    assert.ok(Math.abs(week.taskPlannedHours - 5) < 0.02);
    assert.equal(week.plannedMeetingHours, 3);
    assert.ok(Math.abs(week.forecastDemandHours - 12) < 0.05);
    assert.ok(Math.abs(totals.forecastDemandHours - 12) < 0.05);
  });

  it('task outside baseline adds delta without auto-reducing residual', () => {
    const budgets = [
      {
        residualHoursPerWeek: 12,
        hoursPerWeek: 12,
        phaseStartDate: '2026-10-05',
        phaseEndDate: '2026-10-11',
      },
    ];
    const tasks = [{ effortHours: 5, startDate: '2026-10-06', dueDate: '2026-10-10' }];
    const { byWeek } = computeForecastDemandByWeek({
      budgets,
      tasks,
      meetings: [],
      calendar: CAL,
    });
    const week = byWeek['2026-10-05'];
    assert.equal(week.unallocatedBudgetHours, 12);
    assert.ok(Math.abs(week.forecastDemandHours - 17) < 0.05);
  });
});

describe('projectForecastWithDelta hard-gate', () => {
  it('marks infeasible when projected pct > 100', () => {
    const result = projectForecastWithDelta({
      existingByWeek: { '2026-10-05': { forecastDemandHours: 32 } },
      deltaHoursByWeek: { '2026-10-05': 10 },
      availableHoursByWeek: { '2026-10-05': 40 },
      overloadPct: 100,
    });
    assert.equal(result.feasible, false);
    assert.ok(result.reasons.includes('forecast_overload'));
    assert.equal(result.byWeek['2026-10-05'].forecastWorkloadPct, 105);
  });

  it('allows exactly 100%', () => {
    const result = projectForecastWithDelta({
      existingByWeek: { '2026-10-05': { forecastDemandHours: 32 } },
      deltaHoursByWeek: { '2026-10-05': 8 },
      availableHoursByWeek: { '2026-10-05': 40 },
    });
    assert.equal(result.feasible, true);
    assert.equal(result.byWeek['2026-10-05'].forecastWorkloadPct, 100);
  });
});
