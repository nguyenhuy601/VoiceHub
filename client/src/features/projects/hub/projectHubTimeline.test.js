import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  barPlacement,
  buildFitWindow,
  buildInitialWindow,
  buildJumpWindow,
  clampTimelinePxPerUnit,
  columnsTotalWidth,
  earliestScheduledRange,
  enumerateColumns,
  extendWindow,
  fillViewportPxPerUnit,
  fitTimelinePxPerUnit,
  isMajorTimelineGridColumn,
  isWeekendColumn,
  resolveProjectTimeBounds,
  resolveWorkItemRange,
  scrollLeftForZoomAnchor,
  scrollLeftToShowBar,
  startOfLocalDay,
  startOfWeekMonday,
  timelineBarLabelOutside,
  timelineBarShowsLabel,
  timelineDayHeaderText,
  timelineMinBarPx,
  timelineTodayShowsChip,
  todayOffsetPx,
  unionTimelineBounds,
  ymd,
} from './projectHubTimeline.js';

const TODAY = new Date(2026, 7, 18);

function d(y, m, day) {
  return new Date(y, m, day);
}

test('startOfWeekMonday: Aug 18 2026 → Monday Aug 17', () => {
  assert.equal(ymd(startOfWeekMonday(TODAY)), '2026-08-17');
});

test('resolveProjectTimeBounds: startDate + dueDate', () => {
  const bounds = resolveProjectTimeBounds(
    { startDate: d(2026, 0, 1), dueDate: d(2026, 11, 31) },
    null
  );
  assert.equal(ymd(bounds.start), '2026-01-01');
  assert.equal(ymd(bounds.end), '2026-12-31');
});

test('resolveProjectTimeBounds: fallback createdAt / expectedEndDate', () => {
  const bounds = resolveProjectTimeBounds(
    { createdAt: d(2026, 2, 1), expectedEndDate: d(2026, 5, 30) },
    { dueDate: d(2026, 8, 1) }
  );
  assert.equal(ymd(bounds.start), '2026-03-01');
  assert.equal(ymd(bounds.end), '2026-06-30');
});

test('buildInitialWindow weeks: today ± 1 tuần', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const w = buildInitialWindow('weeks', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-08-10');
  assert.equal(ymd(w.end), '2026-08-30');
});

test('buildInitialWindow months: today ± 2 tháng', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const w = buildInitialWindow('months', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-06-01');
  assert.equal(ymd(w.end), '2026-10-31');
});

test('buildInitialWindow quarters: today ± 1 quý', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const w = buildInitialWindow('quarters', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-04-01');
  assert.equal(ymd(w.end), '2026-12-31');
});

test('buildInitialWindow: today sau dự án → kẹp cuối biên', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 2, 31) };
  const w = buildInitialWindow('months', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-01-01');
  assert.equal(ymd(w.end), '2026-03-31');
});

test('buildInitialWindow: today trước dự án → kẹp đầu biên', () => {
  const bounds = { start: d(2026, 9, 1), end: d(2026, 11, 31) };
  const w = buildInitialWindow('months', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-10-01');
  assert.equal(ymd(w.end), '2026-12-31');
});

test('extendWindow weeks prev/next rồi dừng ở biên', () => {
  const bounds = { start: d(2026, 7, 10), end: d(2026, 7, 30) };
  let w = buildInitialWindow('weeks', TODAY, bounds);
  assert.equal(ymd(w.start), '2026-08-10');
  const same = extendWindow(w, 'weeks', 'prev', bounds);
  assert.equal(ymd(same.start), '2026-08-10');
  const next = extendWindow(w, 'weeks', 'next', bounds);
  assert.equal(ymd(next.end), ymd(w.end));
});

test('extendWindow months thêm 1 tháng rồi dừng', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const w = buildInitialWindow('months', TODAY, bounds);
  const prev = extendWindow(w, 'months', 'prev', bounds);
  assert.equal(ymd(prev.start), '2026-05-01');
  const next = extendWindow(w, 'months', 'next', bounds);
  assert.equal(ymd(next.end), '2026-11-30');
  let atStart = { start: d(2026, 0, 1), end: d(2026, 4, 31) };
  atStart = extendWindow(atStart, 'months', 'prev', bounds);
  assert.equal(ymd(atStart.start), '2026-01-01');
});

test('enumerateColumns weeks: 1 cột = 1 ngày', () => {
  const w = { start: d(2026, 7, 17), end: d(2026, 7, 19) };
  const cols = enumerateColumns(w, 'weeks', 40);
  assert.equal(cols.length, 3);
  assert.equal(cols[0].key, '2026-08-17');
  assert.equal(cols[2].key, '2026-08-19');
  assert.equal(columnsTotalWidth(cols), 120);
});

test('enumerateColumns months / quarters', () => {
  const months = enumerateColumns({ start: d(2026, 6, 1), end: d(2026, 8, 30) }, 'months', 140);
  assert.equal(months.length, 3);
  assert.equal(months[0].key, '2026-07-01');
  const qs = enumerateColumns({ start: d(2026, 3, 1), end: d(2026, 11, 31) }, 'quarters', 220);
  assert.equal(qs.length, 3);
  assert.equal(qs[0].quarter, 2);
  assert.equal(qs[2].quarter, 4);
});

test('barPlacement clip trong cửa sổ; 1 ngày khi thiếu một đầu', () => {
  const cols = enumerateColumns({ start: d(2026, 7, 10), end: d(2026, 7, 16) }, 'weeks', 40);
  const full = barPlacement(d(2026, 7, 11), d(2026, 7, 13), cols);
  assert.equal(full.left, 40);
  assert.equal(full.width, 120);
  const one = barPlacement(d(2026, 7, 12), null, cols);
  assert.equal(one.left, 80);
  assert.equal(one.width, 40);
  const clipped = barPlacement(d(2026, 7, 1), d(2026, 7, 20), cols);
  assert.equal(clipped.left, 0);
  assert.equal(clipped.width, 280);
  assert.equal(barPlacement(d(2026, 6, 1), d(2026, 6, 10), cols), null);
});

test('fillViewportPxPerUnit: cột tháng/quý đầy viewport', () => {
  const win = { start: d(2026, 6, 1), end: d(2026, 8, 30) };
  const px = fillViewportPxPerUnit('months', win, 900);
  assert.equal(px, 300);
  const qs = fillViewportPxPerUnit(
    'quarters',
    { start: d(2026, 6, 1), end: d(2026, 11, 31) },
    560
  );
  assert.equal(qs, 280);
});

test('timelineMinBarPx + barPlacement: tháng không còn vệt mỏng 1 ngày', () => {
  const px = 300;
  const minBar = timelineMinBarPx('months', px);
  assert.ok(minBar >= 22);
  const cols = enumerateColumns({ start: d(2026, 6, 1), end: d(2026, 8, 30) }, 'months', px);
  const oneDay = barPlacement(d(2026, 7, 18), d(2026, 7, 18), cols, { minBarPx: minBar });
  assert.ok(oneDay.width >= minBar);
  assert.ok(oneDay.width > 10);
});

test('todayOffsetPx trong / ngoài cửa sổ', () => {
  const cols = enumerateColumns({ start: d(2026, 7, 17), end: d(2026, 7, 23) }, 'weeks', 40);
  // Aug 18 = cột thứ 2 → giữa cột = 40 + 20
  assert.equal(todayOffsetPx(TODAY, cols), 60);
  assert.equal(todayOffsetPx(d(2026, 6, 1), cols), null);
});

test('resolveWorkItemRange: card một đầu → 1 ngày; epic từ target + con', () => {
  const onlyDue = resolveWorkItemRange({ startDate: null, dueDate: d(2026, 7, 20) });
  assert.equal(ymd(onlyDue.start), '2026-08-20');
  assert.equal(ymd(onlyDue.end), '2026-08-20');
  const none = resolveWorkItemRange({ title: 'no dates' });
  assert.equal(none, null);
  const epic = resolveWorkItemRange(
    {
      kind: 'planning',
      raw: { type: 'epic', targetDate: d(2026, 8, 1), createdAt: d(2026, 6, 1) },
    },
    [{ start: d(2026, 7, 1), end: d(2026, 7, 15) }]
  );
  assert.equal(ymd(epic.start), '2026-08-01');
  assert.equal(ymd(epic.end), '2026-09-01');
});

test('startOfLocalDay invalid → null', () => {
  assert.equal(startOfLocalDay('nope'), null);
  assert.equal(startOfLocalDay(null), null);
});

test('clampTimelinePxPerUnit: kẹp min/max theo scale', () => {
  assert.equal(clampTimelinePxPerUnit('weeks', 10), 20);
  assert.equal(clampTimelinePxPerUnit('weeks', 40), 40);
  assert.equal(clampTimelinePxPerUnit('weeks', 200), 96);
  assert.equal(clampTimelinePxPerUnit('months', 50), 100);
  assert.equal(clampTimelinePxPerUnit('months', 500), 400);
  assert.equal(clampTimelinePxPerUnit('quarters', 100), 160);
  assert.equal(clampTimelinePxPerUnit('quarters', 800), 640);
});

test('scrollLeftForZoomAnchor: giữ điểm neo khi zoom', () => {
  assert.equal(scrollLeftForZoomAnchor(100, 50, 40, 80), 250);
  assert.equal(scrollLeftForZoomAnchor(100, 50, 80, 40), 25);
  assert.equal(scrollLeftForZoomAnchor(0, 0, 40, 80), 0);
});

test('unionTimelineBounds / earliestScheduledRange / scrollLeftToShowBar', () => {
  const a = { start: d(2023, 7, 12), end: d(2023, 8, 17) };
  const b = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const u = unionTimelineBounds(a, b);
  assert.equal(ymd(u.start), '2023-08-12');
  assert.equal(ymd(u.end), '2026-12-31');
  assert.equal(unionTimelineBounds(null, null), null);
  const early = earliestScheduledRange([b, a]);
  assert.equal(ymd(early.start), '2023-08-12');
  assert.equal(scrollLeftToShowBar({ left: 400, width: 80 }, 400), 240);
  assert.equal(scrollLeftToShowBar({ left: 100, width: 500 }, 200, 24), 76);
});

test('buildJumpWindow: quanh focus, kẹp biên', () => {
  const bounds = { start: d(2023, 0, 1), end: d(2026, 11, 31) };
  const focus = { start: d(2023, 7, 12), end: d(2023, 8, 17) };
  const win = buildJumpWindow('weeks', focus, bounds);
  assert.ok(win.start.getTime() <= focus.start.getTime());
  assert.ok(win.end.getTime() >= focus.end.getTime());
});

test('buildFitWindow: toàn biên dự án theo scale', () => {
  const bounds = { start: d(2026, 0, 15), end: d(2026, 5, 20) };
  const months = buildFitWindow('months', bounds);
  assert.equal(ymd(months.start), '2026-01-01');
  assert.equal(ymd(months.end), '2026-06-30');
  const weeks = buildFitWindow('weeks', bounds);
  assert.equal(ymd(weeks.start), '2026-01-12');
  assert.equal(ymd(weeks.end), '2026-06-21');
});

test('fitTimelinePxPerUnit: thu nhỏ để vừa viewport', () => {
  const bounds = { start: d(2026, 0, 1), end: d(2026, 11, 31) };
  const px = fitTimelinePxPerUnit('months', bounds, 600);
  assert.equal(px, 100);
  assert.equal(px, clampTimelinePxPerUnit('months', px));
  const wide = fitTimelinePxPerUnit('months', bounds, 4000);
  assert.ok(wide >= 100);
  assert.ok(wide <= 400);
});

test('isWeekendColumn: chỉ scale weeks, Sat/Sun', () => {
  assert.equal(isWeekendColumn({ scale: 'weeks', start: d(2026, 7, 22) }), true);
  assert.equal(isWeekendColumn({ scale: 'weeks', start: d(2026, 7, 23) }), true);
  assert.equal(isWeekendColumn({ scale: 'weeks', start: d(2026, 7, 20) }), false);
  assert.equal(isWeekendColumn({ scale: 'months', start: d(2026, 7, 22) }), false);
});

test('isMajorTimelineGridColumn: weeks = Monday; months mọi cột', () => {
  assert.equal(isMajorTimelineGridColumn({ scale: 'weeks', start: d(2026, 7, 17) }), true);
  assert.equal(isMajorTimelineGridColumn({ scale: 'weeks', start: d(2026, 7, 20) }), false);
  assert.equal(isMajorTimelineGridColumn({ scale: 'months', start: d(2026, 7, 1) }), true);
});

test('timelineDayHeaderText / timelineTodayShowsChip theo độ rộng cột', () => {
  const mon = { scale: 'weeks', day: 17, start: d(2026, 7, 17), widthPx: 40 };
  const tue = { scale: 'weeks', day: 18, start: d(2026, 7, 18), widthPx: 40 };
  assert.ok(timelineDayHeaderText(mon, 'vi').includes('17'));
  assert.equal(timelineDayHeaderText({ ...tue, widthPx: 20 }, 'vi'), '18');
  assert.equal(timelineDayHeaderText({ ...tue, widthPx: 10 }, 'vi'), '');
  assert.equal(timelineDayHeaderText({ ...mon, widthPx: 10 }, 'vi'), '17');
  assert.equal(timelineTodayShowsChip(40), true);
  assert.equal(timelineTodayShowsChip(20), false);
});

test('timelineBarShowsLabel / timelineBarLabelOutside: 1 cột không ngoài', () => {
  assert.equal(timelineBarShowsLabel(79), false);
  assert.equal(timelineBarShowsLabel(80), true);
  assert.equal(timelineBarLabelOutside(40), false);
  assert.equal(timelineBarLabelOutside(120), true);
  assert.equal(timelineBarLabelOutside(96, 96), false);
  assert.equal(timelineBarLabelOutside(100, 96), false);
  assert.equal(timelineBarLabelOutside(200, 96), true);
});
