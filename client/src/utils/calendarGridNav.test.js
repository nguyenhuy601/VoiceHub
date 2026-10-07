import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCalendarGridNav } from './calendarGridNav.js';

describe('resolveCalendarGridNav', () => {
  it('←/→ ±1 ngày, qua ranh tháng trả monthDelta', () => {
    assert.deepEqual(resolveCalendarGridNav('2026-10-15', 'ArrowRight'), { dateKey: '2026-10-16', monthDelta: 0 });
    assert.deepEqual(resolveCalendarGridNav('2026-10-01', 'ArrowLeft'), { dateKey: '2026-09-30', monthDelta: -1 });
    assert.deepEqual(resolveCalendarGridNav('2026-12-31', 'ArrowRight'), { dateKey: '2027-01-01', monthDelta: 1 });
  });

  it('↑/↓ ±7 ngày', () => {
    assert.equal(resolveCalendarGridNav('2026-10-15', 'ArrowUp').dateKey, '2026-10-08');
    assert.deepEqual(resolveCalendarGridNav('2026-10-29', 'ArrowDown'), { dateKey: '2026-11-05', monthDelta: 1 });
  });

  it('Home/End theo đầu tuần Chủ nhật (mặc định)', () => {
    // 2026-10-15 là thứ Năm
    assert.equal(resolveCalendarGridNav('2026-10-15', 'Home').dateKey, '2026-10-11');
    assert.equal(resolveCalendarGridNav('2026-10-15', 'End').dateKey, '2026-10-17');
  });

  it('Home/End theo đầu tuần Thứ Hai', () => {
    assert.equal(resolveCalendarGridNav('2026-10-15', 'Home', { weekStartsOn: 1 }).dateKey, '2026-10-12');
    assert.equal(resolveCalendarGridNav('2026-10-15', 'End', { weekStartsOn: 1 }).dateKey, '2026-10-18');
  });

  it('PageUp/PageDown giữ ngày, kẹp cuối tháng', () => {
    assert.deepEqual(resolveCalendarGridNav('2026-10-15', 'PageDown'), { dateKey: '2026-11-15', monthDelta: 1 });
    assert.deepEqual(resolveCalendarGridNav('2026-03-31', 'PageUp'), { dateKey: '2026-02-28', monthDelta: -1 });
    assert.deepEqual(resolveCalendarGridNav('2027-01-31', 'PageUp'), { dateKey: '2026-12-31', monthDelta: -1 });
  });

  it('phím khác hoặc dateKey sai → null', () => {
    assert.equal(resolveCalendarGridNav('2026-10-15', 'Enter'), null);
    assert.equal(resolveCalendarGridNav('bad', 'ArrowLeft'), null);
  });
});
