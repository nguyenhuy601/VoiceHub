/**
 * T3 — Schedule capacity 8h/day packing.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  packScheduleCapacity,
  DAILY_CAP_HOURS,
} = require('../src/utils/aiAnalysis/aiAnalysisScheduleCapacity');

describe('aiAnalysisScheduleCapacity', () => {
  it('does not exceed 8h/day for one user with two tasks', () => {
    const { schedule, completion } = packScheduleCapacity({
      tasks: [
        { id: 'T1', effortHours: 6 },
        { id: 'T2', effortHours: 6 },
      ],
      edges: [],
      assignments: [
        { taskId: 'T1', userId: 'u1' },
        { taskId: 'T2', userId: 'u1' },
      ],
      projectStart: '2026-09-07', // Monday
    });

    const byDay = new Map();
    for (const row of schedule) {
      const key = `${row.userId}|${row.dateKey}`;
      byDay.set(key, (byDay.get(key) || 0) + row.hours + (row.meetingHours || 0));
    }
    for (const [, total] of byDay) {
      assert.ok(total <= DAILY_CAP_HOURS + 1e-6, `day load ${total}`);
    }
    assert.ok(completion.estimatedEnd >= completion.projectStart);
    assert.equal(completion.totalEffortHours, 12);
  });

  it('respects predecessor before scheduling successor', () => {
    const { schedule } = packScheduleCapacity({
      tasks: [
        { id: 'A', effortHours: 8 },
        { id: 'B', effortHours: 4 },
      ],
      edges: [{ from: 'B', to: 'A' }],
      assignments: [
        { taskId: 'A', userId: 'u1' },
        { taskId: 'B', userId: 'u2' },
      ],
      projectStart: '2026-09-07',
    });

    const aEnd = schedule.filter((r) => r.taskId === 'A').map((r) => r.dateKey).sort().pop();
    const bStart = schedule.filter((r) => r.taskId === 'B').map((r) => r.dateKey).sort()[0];
    assert.ok(aEnd);
    assert.ok(bStart);
    assert.ok(bStart >= aEnd);
  });

  it('meetingHours reduce remaining capacity', () => {
    const { schedule } = packScheduleCapacity({
      tasks: [{ id: 'T1', effortHours: 6 }],
      edges: [],
      assignments: [{ taskId: 'T1', userId: 'u1' }],
      projectStart: '2026-09-07',
      meetingHoursByUserDay: { 'u1|2026-09-07': 4 },
    });

    const day1 = schedule.filter((r) => r.dateKey === '2026-09-07');
    const hoursDay1 = day1.reduce((s, r) => s + r.hours, 0);
    assert.ok(hoursDay1 <= 4 + 1e-6);
    assert.ok(schedule.some((r) => r.dateKey > '2026-09-07'));
  });
});
