const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEstimateHours,
  toDateKey,
  listWeekdays,
  spreadCardHours,
  evaluateSchedule,
  hoursFieldsTouched,
} = require('../src/services/hoursCapacityGuard.service');

/** 2026-08-10 = Monday (T2). */
const MON = '2026-08-10';
const FRI = '2026-08-14';
const SAT = '2026-08-15';
const SUN = '2026-08-16';

describe('hoursCapacityGuard math', () => {
  it('10h T2–T6 chia đều 2h/ngày, không cảnh báo', () => {
    const spread = spreadCardHours({ estimateHours: 10, startDate: MON, dueDate: FRI });
    assert.equal(listWeekdays(MON, FRI).length, 5);
    assert.equal(spread[MON], 2);
    assert.equal(spread['2026-08-11'], 2);
    assert.equal(spread['2026-08-12'], 2);
    assert.equal(spread['2026-08-13'], 2);
    assert.equal(spread[FRI], 2);
    const out = evaluateSchedule([{ estimateHours: 10, startDate: MON, dueDate: FRI }]);
    assert.equal(out.shouldWarn, false);
    assert.equal(out.daily.length, 0);
    assert.equal(out.weekly.length, 0);
  });

  it('12h một ngày (T2) → cảnh báo ngày, không cảnh báo tuần', () => {
    const spread = spreadCardHours({ estimateHours: 12, startDate: MON, dueDate: MON });
    assert.equal(spread[MON], 12);
    const out = evaluateSchedule([{ estimateHours: 12, startDate: MON, dueDate: MON }]);
    assert.equal(out.shouldWarn, true);
    assert.equal(out.daily.length, 1);
    assert.equal(out.daily[0].weekday, 'T2');
    assert.equal(out.daily[0].hours, 12);
    assert.equal(out.daily[0].overBy, 4);
    assert.equal(out.weekly.length, 0);
  });

  it('5 thẻ × 9h mỗi ngày → cảnh báo ngày và tuần 45/40', () => {
    const days = listWeekdays(MON, FRI);
    const cards = days.map((d) => ({ estimateHours: 9, startDate: d, dueDate: d }));
    const out = evaluateSchedule(cards);
    assert.equal(out.shouldWarn, true);
    assert.equal(out.daily.length, 5);
    assert.ok(out.daily.every((row) => row.hours === 9 && row.overBy === 1));
    assert.equal(out.weekly.length, 1);
    assert.equal(out.weekly[0].hours, 45);
    assert.equal(out.weekly[0].overBy, 5);
  });

  it('Board A 4h + Board B 8h cùng tuần → 2.4h/ngày, tuần 12/40 không lố', () => {
    const out = evaluateSchedule([
      { estimateHours: 4, startDate: MON, dueDate: FRI },
      { estimateHours: 8, startDate: MON, dueDate: FRI },
    ]);
    assert.equal(out.schedule[MON], 2.4);
    assert.equal(out.shouldWarn, false);
    const weekHours = listWeekdays(MON, FRI).reduce((s, d) => s + out.schedule[d], 0);
    assert.equal(Math.round(weekHours * 100) / 100, 12);
  });

  it('range chỉ T7–CN đổ cả giờ vào startDate', () => {
    const spread = spreadCardHours({ estimateHours: 12, startDate: SAT, dueDate: SUN });
    assert.equal(spread[SAT], 12);
    assert.equal(spread[SUN], undefined);
    const out = evaluateSchedule([{ estimateHours: 12, startDate: SAT, dueDate: SUN }]);
    assert.equal(out.daily[0].date, SAT);
    assert.equal(out.weekly.length, 0);
  });

  it('thẻ cũ chỉ dueDate → coi start = due (1 ngày)', () => {
    const spread = spreadCardHours({ estimateHours: 3, dueDate: MON });
    assert.equal(spread[MON], 3);
  });

  it('normalizeEstimateHours làm tròn 2 chữ số; hoursFieldsTouched bỏ PATCH title', () => {
    assert.equal(normalizeEstimateHours(10.456), 10.46);
    assert.equal(normalizeEstimateHours(null), null);
    assert.equal(hoursFieldsTouched({ title: 'x' }), false);
    assert.equal(hoursFieldsTouched({ estimateHours: 10 }), true);
    assert.equal(hoursFieldsTouched({ assigneeId: 'u1' }), true);
  });

  it('toDateKey giữ prefix YYYY-MM-DD và Date VN UTC+7', () => {
    assert.equal(toDateKey('2026-08-14T00:00:00.000+07:00'), '2026-08-14');
    assert.equal(toDateKey(new Date('2026-08-13T17:00:00.000Z')), '2026-08-14');
  });
});
