/** Timeline Project Hub — cửa sổ thời gian, cột, vị trí bar (thuần, không I/O). */

export const TIMELINE_SCALES = ['weeks', 'months', 'quarters'];

export const TIMELINE_INITIAL_OFFSET = {
  weeks: 1,
  months: 2,
  quarters: 1,
};

export const TIMELINE_PX_PER_UNIT = {
  weeks: 40,
  months: 180,
  quarters: 280,
};

export const TIMELINE_PX_PER_UNIT_MIN = {
  weeks: 20,
  months: 100,
  quarters: 160,
};

export const TIMELINE_PX_PER_UNIT_MAX = {
  weeks: 96,
  months: 400,
  quarters: 640,
};

/** Giữ pxPerUnit trong biên zoom theo scale. */
export function clampTimelinePxPerUnit(scale, pxPerUnit) {
  const base = TIMELINE_PX_PER_UNIT[scale] ?? TIMELINE_PX_PER_UNIT.weeks;
  const min = TIMELINE_PX_PER_UNIT_MIN[scale] ?? base * 0.5;
  const max = TIMELINE_PX_PER_UNIT_MAX[scale] ?? base * 2;
  const n = Number(pxPerUnit);
  if (!Number.isFinite(n)) return base;
  return Math.min(max, Math.max(min, n));
}

/**
 * Giữ điểm neo dưới con trỏ khi đổi pxPerUnit (zoom).
 * @param {number} scrollLeft scrollLeft hiện tại
 * @param {number} pointerX vị trí X trong viewport timeline (px)
 * @param {number} oldPx pxPerUnit cũ
 * @param {number} newPx pxPerUnit mới
 */
export function scrollLeftForZoomAnchor(scrollLeft, pointerX, oldPx, newPx) {
  const old = Number(oldPx);
  const next = Number(newPx);
  if (!Number.isFinite(old) || !Number.isFinite(next) || old <= 0 || next <= 0) {
    return Math.max(0, Number(scrollLeft) || 0);
  }
  const factor = next / old;
  return Math.max(0, (Number(scrollLeft) + Number(pointerX)) * factor - Number(pointerX));
}

export const TIMELINE_SCROLL_EDGE_PX = 80;
export const TIMELINE_ROW_PX = 48;
export const TIMELINE_MIN_BAR_PX = 8;
/** Bar tối thiểu theo scale — tháng/quý tránh vệt mỏng bị đè. */
export function timelineMinBarPx(scale, pxPerUnit) {
  const px = Number(pxPerUnit);
  const unit = Number.isFinite(px) && px > 0 ? px : TIMELINE_PX_PER_UNIT[scale] || 40;
  if (scale === 'quarters') return Math.max(28, Math.round(unit * 0.14));
  if (scale === 'months') return Math.max(22, Math.round(unit * 0.14));
  return TIMELINE_MIN_BAR_PX;
}
/** Bar đủ rộng mới đặt label ngoài phải (tránh 1-day trông lệch cột). */
export const TIMELINE_BAR_LABEL_MIN_PX = 80;
/** Cột weeks: hiện "Thứ X N"; hẹp hơn → chỉ số ngày; rất hẹp → chỉ Monday. */
export const TIMELINE_DAY_LABEL_FULL_MIN_PX = 36;
export const TIMELINE_DAY_LABEL_NUM_MIN_PX = 16;
/** Hiện chip chữ "Hôm nay" cạnh badge Today. */
export const TIMELINE_TODAY_CHIP_MIN_PX = 40;

export function timelineBarShowsLabel(widthPx) {
  return Number(widthPx) >= TIMELINE_BAR_LABEL_MIN_PX;
}

/**
 * true = label ngoài phải bar; false = label trong bar.
 * Bar ≤ ~1.25 cột (vd. đúng 1 ngày khi zoom) → luôn trong, dù cột rộng ≥ 80px.
 */
export function timelineBarLabelOutside(widthPx, columnWidthPx = 0) {
  const w = Number(widthPx) || 0;
  const col = Number(columnWidthPx) || 0;
  if (col > 0 && w <= col * 1.25) return false;
  return w >= TIMELINE_BAR_LABEL_MIN_PX;
}

/**
 * Nhãn header cột weeks theo độ rộng (tránh đè chữ khi zoom out).
 * @returns {string}
 */
export function timelineDayHeaderText(col, locale = 'vi') {
  if (!col || String(col.scale || '') !== 'weeks') return '';
  const w = Number(col.widthPx) || 0;
  const dayNum = String(col.day ?? '');
  if (w < TIMELINE_DAY_LABEL_NUM_MIN_PX) {
    return isMajorTimelineGridColumn(col) ? dayNum : '';
  }
  if (w < TIMELINE_DAY_LABEL_FULL_MIN_PX) {
    return dayNum;
  }
  const d = col.start instanceof Date ? col.start : new Date(col.start);
  if (Number.isNaN(d.getTime())) return dayNum;
  const wd = d.toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', { weekday: 'short' });
  return `${wd} ${dayNum}`;
}

export function timelineTodayShowsChip(columnWidthPx) {
  return Number(columnWidthPx) >= TIMELINE_TODAY_CHIP_MIN_PX;
}

/** Cột ngày (scale weeks) rơi thứ Bảy / Chủ nhật. */
export function isWeekendColumn(col) {
  if (String(col?.scale || '') !== 'weeks') return false;
  const raw = col?.start;
  const d = raw instanceof Date ? raw : new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Đường lưới dọc “major”: weeks = Monday; months/quarters = mọi cột.
 */
export function isMajorTimelineGridColumn(col) {
  if (!col?.start) return false;
  if (String(col.scale || '') === 'weeks') {
    const d = col.start instanceof Date ? col.start : new Date(col.start);
    if (Number.isNaN(d.getTime())) return false;
    return d.getDay() === 1;
  }
  return true;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfLocalDay(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date.getTime());
  d.setDate(d.getDate() + Number(n || 0));
  return d;
}

export function startOfWeekMonday(value) {
  const d = startOfLocalDay(value);
  if (!d) return null;
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function startOfMonth(value) {
  const d = startOfLocalDay(value);
  if (!d) return null;
  d.setDate(1);
  return d;
}

export function addMonths(date, n) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + Number(n || 0));
  return d;
}

export function startOfQuarter(value) {
  const d = startOfMonth(value);
  if (!d) return null;
  d.setMonth(Math.floor(d.getMonth() / 3) * 3);
  return d;
}

export function addQuarters(date, n) {
  return addMonths(date, Number(n || 0) * 3);
}

export function endOfWeek(weekStart) {
  return addDays(weekStart, 6);
}

export function endOfMonth(monthStart) {
  return addDays(addMonths(monthStart, 1), -1);
}

export function endOfQuarter(quarterStart) {
  return addDays(addMonths(quarterStart, 3), -1);
}

export function ymd(date) {
  const d = startOfLocalDay(date);
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function unitStart(scale, value) {
  if (scale === 'weeks') return startOfWeekMonday(value);
  if (scale === 'quarters') return startOfQuarter(value);
  return startOfMonth(value);
}

export function addUnits(scale, date, n) {
  if (scale === 'weeks') return addDays(date, Number(n || 0) * 7);
  if (scale === 'quarters') return addQuarters(date, n);
  return addMonths(date, n);
}

export function unitEnd(scale, unitStartDate) {
  if (scale === 'weeks') return endOfWeek(unitStartDate);
  if (scale === 'quarters') return endOfQuarter(unitStartDate);
  return endOfMonth(unitStartDate);
}

/**
 * Biên timeline: startDate → dueDate (fallback createdAt / expectedEndDate / board).
 * @returns {{ start: Date, end: Date } | null}
 */
export function resolveProjectTimeBounds(project, board) {
  const startRaw =
    project?.startDate || board?.startDate || project?.createdAt || board?.createdAt;
  const endRaw = project?.dueDate || project?.expectedEndDate || board?.dueDate;
  const start = startOfLocalDay(startRaw);
  const end = startOfLocalDay(endRaw);
  if (!start && !end) return null;
  if (start && !end) return { start, end: start };
  if (!start && end) return { start: end, end };
  if (start.getTime() > end.getTime()) return { start: end, end: start };
  return { start, end };
}

function boundUnitRange(scale, bounds) {
  if (!bounds?.start || !bounds?.end) return null;
  return {
    start: unitStart(scale, bounds.start),
    end: unitEnd(scale, unitStart(scale, bounds.end)),
  };
}

/** Cửa sổ Fit = toàn biên dự án theo scale (unit-aligned). */
export function buildFitWindow(scale, bounds) {
  return boundUnitRange(scale, bounds);
}

/**
 * Gộp nhiều khoảng ngày (min start / max end). Bỏ qua null.
 * @returns {{ start: Date, end: Date } | null}
 */
export function unionTimelineBounds(...parts) {
  let min = null;
  let max = null;
  for (const part of parts) {
    if (!part?.start || !part?.end) continue;
    const a = startOfLocalDay(part.start);
    const b = startOfLocalDay(part.end);
    if (!a || !b) continue;
    const lo = a.getTime() <= b.getTime() ? a : b;
    const hi = a.getTime() <= b.getTime() ? b : a;
    if (!min || lo.getTime() < min.getTime()) min = lo;
    if (!max || hi.getTime() > max.getTime()) max = hi;
  }
  if (!min || !max) return null;
  return { start: min, end: max };
}

/** Khoảng scheduled sớm nhất (theo start). */
export function earliestScheduledRange(ranges) {
  let best = null;
  for (const range of ranges || []) {
    if (!range?.start || !range?.end) continue;
    const a = startOfLocalDay(range.start);
    const b = startOfLocalDay(range.end);
    if (!a || !b) continue;
    const start = a.getTime() <= b.getTime() ? a : b;
    const end = a.getTime() <= b.getTime() ? b : a;
    if (!best || start.getTime() < best.start.getTime()) best = { start, end };
  }
  return best;
}

/**
 * scrollLeft để bar nằm trong viewport (căn giữa nếu ngắn hơn ~85% viewport).
 */
export function scrollLeftToShowBar(place, viewportWidthPx, paddingPx = 24) {
  if (!place || !Number.isFinite(Number(place.left))) return 0;
  const vw = Math.max(1, Number(viewportWidthPx) || 0);
  const pad = Math.max(0, Number(paddingPx) || 0);
  const left = Number(place.left);
  const width = Math.max(0, Number(place.width) || 0);
  if (width <= vw * 0.85) {
    return Math.max(0, left + width / 2 - vw / 2);
  }
  return Math.max(0, left - pad);
}

/**
 * Cửa sổ quanh một khoảng lịch (jump), kẹp biên timeline.
 */
export function buildJumpWindow(scale, focusRange, bounds) {
  if (!focusRange?.start) return buildFitWindow(scale, bounds);
  const offset = TIMELINE_INITIAL_OFFSET[scale] ?? 1;
  const focusStart = startOfLocalDay(focusRange.start);
  const focusEnd = startOfLocalDay(focusRange.end) || focusStart;
  if (!focusStart) return buildFitWindow(scale, bounds);
  const idealStart = unitStart(scale, addUnits(scale, unitStart(scale, focusStart), -offset));
  const idealEnd = unitEnd(scale, addUnits(scale, unitStart(scale, focusEnd), offset));
  const boundRange = boundUnitRange(scale, bounds);
  if (!boundRange) return { start: idealStart, end: idealEnd };
  return (
    clampWindowToBounds({ start: idealStart, end: idealEnd }, boundRange) || {
      start: boundRange.start,
      end: boundRange.end,
    }
  );
}

/**
 * pxPerUnit để toàn biên dự án vừa viewport (clamp min/max).
 * @param {number} viewportWidthPx chiều rộng vùng Gantt (không gồm cột Work)
 */
export function fitTimelinePxPerUnit(scale, bounds, viewportWidthPx) {
  const window = boundUnitRange(scale, bounds);
  const base = TIMELINE_PX_PER_UNIT[scale] ?? TIMELINE_PX_PER_UNIT.weeks;
  if (!window) return base;
  const cols = enumerateColumns(window, scale, 1);
  const n = cols.length || 1;
  const target = Math.max(120, Number(viewportWidthPx) || 0);
  return clampTimelinePxPerUnit(scale, target / n);
}

/**
 * Phóng cột cửa sổ hiện tại cho đầy viewport (tháng/quý không còn khoảng trống phải).
 */
export function fillViewportPxPerUnit(scale, window, viewportWidthPx) {
  const base = TIMELINE_PX_PER_UNIT[scale] ?? TIMELINE_PX_PER_UNIT.weeks;
  if (!window?.start || !window?.end) return base;
  const cols = enumerateColumns(window, scale, 1);
  const n = cols.length || 1;
  const target = Math.max(120, Number(viewportWidthPx) || 0);
  return clampTimelinePxPerUnit(scale, target / n);
}

function clampWindowToBounds(window, boundRange) {
  if (!boundRange) return window;
  let { start, end } = window;
  if (start.getTime() < boundRange.start.getTime()) start = boundRange.start;
  if (end.getTime() > boundRange.end.getTime()) end = boundRange.end;
  if (start.getTime() > end.getTime()) return null;
  return { start, end };
}

/**
 * Cửa sổ ban đầu quanh today, kẹp biên dự án.
 * Today ngoài dự án → kẹp vào đầu hoặc cuối, giữ kích thước cửa sổ tối đa trong biên.
 */
export function buildInitialWindow(scale, today, bounds) {
  const offset = TIMELINE_INITIAL_OFFSET[scale] ?? 1;
  const todayDay = startOfLocalDay(today) || startOfLocalDay(new Date());
  const idealStart = unitStart(scale, addUnits(scale, unitStart(scale, todayDay), -offset));
  const idealEnd = unitEnd(scale, addUnits(scale, unitStart(scale, todayDay), offset));
  const boundRange = boundUnitRange(scale, bounds);
  if (!boundRange) return { start: idealStart, end: idealEnd };

  const todayInBounds =
    todayDay.getTime() >= bounds.start.getTime() && todayDay.getTime() <= bounds.end.getTime();
  if (todayInBounds) {
    return (
      clampWindowToBounds({ start: idealStart, end: idealEnd }, boundRange) || {
        start: boundRange.start,
        end: boundRange.end,
      }
    );
  }

  const span = offset * 2;
  if (todayDay.getTime() < bounds.start.getTime()) {
    const end = unitEnd(scale, addUnits(scale, boundRange.start, span));
    return {
      start: boundRange.start,
      end: end.getTime() > boundRange.end.getTime() ? boundRange.end : end,
    };
  }
  const start = unitStart(scale, addUnits(scale, unitStart(scale, boundRange.end), -span));
  return {
    start: start.getTime() < boundRange.start.getTime() ? boundRange.start : start,
    end: boundRange.end,
  };
}

/**
 * Nới cửa sổ 1 đơn vị. Không đổi nếu đã chạm biên dự án.
 * @param {'prev' | 'next'} direction
 */
export function extendWindow(window, scale, direction, bounds) {
  if (!window?.start || !window?.end) return window;
  const boundRange = boundUnitRange(scale, bounds);
  if (direction === 'prev') {
    const nextStart = addUnits(scale, unitStart(scale, window.start), -1);
    if (boundRange && nextStart.getTime() < boundRange.start.getTime()) return window;
    return { start: nextStart, end: window.end };
  }
  if (direction === 'next') {
    const lastUnit = unitStart(scale, window.end);
    const nextLast = addUnits(scale, lastUnit, 1);
    if (boundRange && nextLast.getTime() > unitStart(scale, boundRange.end).getTime()) {
      return window;
    }
    return { start: window.start, end: unitEnd(scale, nextLast) };
  }
  return window;
}

function columnMeta(date, extra) {
  const d = startOfLocalDay(date);
  return {
    year: d.getFullYear(),
    month: d.getMonth(),
    day: d.getDate(),
    quarter: Math.floor(d.getMonth() / 3) + 1,
    ...extra,
  };
}

/**
 * Cột hiển thị: Weeks = ngày; Months = tháng; Quarters = quý.
 */
export function enumerateColumns(window, scale, pxPerUnit) {
  if (!window?.start || !window?.end) return [];
  const px = Number(pxPerUnit) || TIMELINE_PX_PER_UNIT[scale] || TIMELINE_PX_PER_UNIT.weeks;
  const cols = [];

  if (scale === 'weeks') {
    let cursor = startOfLocalDay(window.start);
    const last = startOfLocalDay(window.end);
    while (cursor && last && cursor.getTime() <= last.getTime()) {
      cols.push({
        key: ymd(cursor),
        start: new Date(cursor.getTime()),
        end: new Date(cursor.getTime()),
        widthPx: px,
        scale,
        ...columnMeta(cursor, {}),
      });
      cursor = addDays(cursor, 1);
    }
    return cols;
  }

  let cursor = unitStart(scale, window.start);
  const last = unitStart(scale, window.end);
  while (cursor && last && cursor.getTime() <= last.getTime()) {
    const end = unitEnd(scale, cursor);
    cols.push({
      key: ymd(cursor),
      start: new Date(cursor.getTime()),
      end,
      widthPx: px,
      scale,
      ...columnMeta(cursor, {}),
    });
    cursor = addUnits(scale, cursor, 1);
  }
  return cols;
}

export function columnsTotalWidth(columns) {
  return (columns || []).reduce((sum, col) => sum + (Number(col.widthPx) || 0), 0);
}

function columnEndExclusive(col) {
  return addDays(col.end, 1);
}

function offsetPxAt(date, columns, edge = 'start') {
  if (!columns?.length) return 0;
  const day = startOfLocalDay(date);
  if (!day) return 0;
  const edgeMs = edge === 'end' ? addDays(day, 1).getTime() : day.getTime();
  let x = 0;
  for (const col of columns) {
    const cs = col.start.getTime();
    const ce = columnEndExclusive(col).getTime();
    if (edgeMs <= cs) return x;
    if (edgeMs < ce) {
      const frac = (edgeMs - cs) / (ce - cs);
      return x + frac * col.widthPx;
    }
    x += col.widthPx;
  }
  return x;
}

/**
 * Vị trí bar trong cửa sổ cột. Item ngoài cửa sổ → null. Thiếu một đầu → 1 ngày.
 * @param {{ minBarPx?: number }} [opts]
 */
export function barPlacement(itemStart, itemEnd, columns, opts = {}) {
  if (!columns?.length) return null;
  const start = startOfLocalDay(itemStart);
  const end = startOfLocalDay(itemEnd);
  if (!start && !end) return null;
  const a = start || end;
  const b = end || start;
  const windowStart = columns[0].start;
  const windowEnd = columns[columns.length - 1].end;
  if (b.getTime() < windowStart.getTime() || a.getTime() > windowEnd.getTime()) return null;
  const clipA = a.getTime() < windowStart.getTime() ? windowStart : a;
  const clipB = b.getTime() > windowEnd.getTime() ? windowEnd : b;
  const left = offsetPxAt(clipA, columns, 'start');
  const right = offsetPxAt(clipB, columns, 'end');
  const minBar = Number(opts.minBarPx);
  const floor = Number.isFinite(minBar) && minBar > 0 ? minBar : TIMELINE_MIN_BAR_PX;
  const width = Math.max(right - left, floor);
  return { left, width };
}

/** Vị trí X vạch Today — giữa cột ngày chứa today (không neo mép trái). */
export function todayOffsetPx(today, columns) {
  const day = startOfLocalDay(today);
  if (!day || !columns?.length) return null;
  const first = columns[0].start;
  const last = columns[columns.length - 1].end;
  if (day.getTime() < first.getTime() || day.getTime() > last.getTime()) return null;
  const left = offsetPxAt(day, columns, 'start');
  const col = columns.find((c) => {
    const cs = startOfLocalDay(c.start);
    return cs && cs.getTime() === day.getTime();
  });
  if (col && Number(col.widthPx) > 0) {
    return left + Number(col.widthPx) / 2;
  }
  const right = offsetPxAt(day, columns, 'end');
  return (left + right) / 2;
}

function isPlanningType(raw) {
  const t = String(raw?.type || raw?.workType || '').toLowerCase();
  return t === 'epic' || t === 'feature' || t === 'milestone';
}

/**
 * Khoảng ngày vẽ bar: card startDate/dueDate; Epic targetDate + min/max con.
 * @returns {{ start: Date, end: Date } | null}
 */
export function resolveWorkItemRange(item, childrenRanges = []) {
  const raw = item?.raw && typeof item.raw === 'object' ? item.raw : item;
  if (!raw || typeof raw !== 'object') return null;

  if (item?.kind === 'planning' || isPlanningType(raw)) {
    const target = startOfLocalDay(raw.targetDate);
    const created = startOfLocalDay(raw.createdAt);
    const childStarts = (childrenRanges || []).map((r) => r?.start).filter(Boolean);
    const childEnds = (childrenRanges || []).map((r) => r?.end).filter(Boolean);
    const minChild = childStarts.length
      ? startOfLocalDay(new Date(Math.min(...childStarts.map((d) => d.getTime()))))
      : null;
    const maxChild = childEnds.length
      ? startOfLocalDay(new Date(Math.max(...childEnds.map((d) => d.getTime()))))
      : null;
    const start = minChild || created || target;
    const end = target || maxChild || start;
    if (!start && !end) return null;
    return { start: start || end, end: end || start };
  }

  const start = startOfLocalDay(raw.startDate);
  const due = startOfLocalDay(raw.dueDate);
  if (!start && !due) return null;
  return { start: start || due, end: due || start };
}

export function collectDescendantRanges(node) {
  const out = [];
  const walk = (n) => {
    for (const child of n?.children || []) {
      const range = resolveWorkItemRange(child, collectDescendantRanges(child));
      if (range) out.push(range);
      walk(child);
    }
  };
  walk(node);
  return out;
}

export function rangeForTimelineNode(node) {
  return resolveWorkItemRange(node, collectDescendantRanges(node));
}

export function groupTimelineColumns(columns) {
  const groups = [];
  for (const col of columns || []) {
    const key =
      col.scale === 'weeks' || col.scale === 'months'
        ? `${col.year}-${col.month}`
        : `${col.year}-q${col.quarter}`;
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.widthPx += col.widthPx;
      last.columns.push(col);
    } else {
      groups.push({
        key,
        year: col.year,
        month: col.month,
        quarter: col.quarter,
        scale: col.scale,
        widthPx: col.widthPx,
        columns: [col],
      });
    }
  }
  return groups;
}

export function sprintBarPlacement(sprint, columns) {
  return barPlacement(sprint?.startDate, sprint?.endDate, columns);
}

export function isSameLocalDay(a, b) {
  const da = startOfLocalDay(a);
  const db = startOfLocalDay(b);
  if (!da || !db) return false;
  return da.getTime() === db.getTime();
}
