import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

// calendarUtils dùng import.meta.env (Vite) và import không đuôi — nạp qua data URL để chạy được dưới node --test.
async function loadCalendarUtils() {
  const sourceUrl = new URL('./calendarUtils.js', import.meta.url);
  const workSpreadUrl = pathToFileURL(fileURLToPath(new URL('./calendarWorkSpread.js', import.meta.url))).href;
  const source = readFileSync(sourceUrl, 'utf8')
    .replaceAll('import.meta.env.', '({}).')
    .replace(`from './calendarWorkSpread'`, `from '${workSpreadUrl}'`);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

describe('calendarUtils', () => {
  let utils;
  before(async () => {
    utils = await loadCalendarUtils();
  });

  it('toDateKey trả YYYY-MM-DD theo giờ local, có pad 0', () => {
    assert.equal(utils.toDateKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
    assert.equal(utils.toDateKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
  });

  it('getMonthGridCells luôn 42 ô, đệm đầu đúng thứ của ngày 1 (Chủ nhật đầu tuần)', () => {
    const october = utils.getMonthGridCells(new Date(2026, 9, 15));
    assert.equal(october.length, 42);
    const firstWeekday = new Date(2026, 9, 1).getDay();
    const leadingPads = october.findIndex((cell) => cell.type === 'day');
    assert.equal(leadingPads, firstWeekday);
    assert.equal(october[leadingPads].day, 1);
    assert.equal(october.filter((cell) => cell.type === 'day').length, 31);
  });

  it('getMonthGridCells xử lý tháng 2 năm nhuận và tháng bắt đầu Chủ nhật', () => {
    const feb2028 = utils.getMonthGridCells(new Date(2028, 1, 1));
    assert.equal(feb2028.length, 42);
    assert.equal(feb2028.filter((cell) => cell.type === 'day').length, 29);

    const march2026 = utils.getMonthGridCells(new Date(2026, 2, 10));
    assert.equal(new Date(2026, 2, 1).getDay(), 0);
    assert.equal(march2026[0].type, 'day');
    assert.equal(march2026[0].day, 1);
  });

  it('mergeAndSortCalendarEvents sắp theo startAt, không mutate input, event thiếu startAt lên đầu', () => {
    const input = [
      { id: 'b', startAt: '2026-10-05T10:00:00.000Z' },
      { id: 'none' },
      { id: 'a', startAt: '2026-10-05T08:00:00.000Z' },
    ];
    const snapshot = input.map((e) => e.id);
    const sorted = utils.mergeAndSortCalendarEvents(input);
    assert.deepEqual(sorted.map((e) => e.id), ['none', 'a', 'b']);
    assert.deepEqual(input.map((e) => e.id), snapshot);
  });
});
