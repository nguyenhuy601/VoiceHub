/**
 * Mirror BE hoursCapacityGuard.spreadCardHours — chia estimateHours đều T2–T6.
 * Date keys dùng múi VN (UTC+7) giống backend.
 */

export const CALENDAR_WORKDAY_START_HOUR = 9;
export const CALENDAR_DAILY_HOURS_LIMIT = 8;
export const CALENDAR_TIMELINE_START_HOUR = 8;
export const CALENDAR_TIMELINE_END_HOUR = 18;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function roundHours(n, digits = 2) {
  const f = 10 ** digits;
  return Math.round(Number(n) * f) / f;
}

/** Calendar YYYY-MM-DD. Chuỗi giữ prefix; Date dùng múi VN (UTC+7). */
export function toWorkDateKey(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'string') {
    const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

function utcNoon(dateKey) {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function addDays(dateKey, n) {
  const d = utcNoon(dateKey);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function weekdayIndex(dateKey) {
  return utcNoon(dateKey).getUTCDay();
}

function isWeekday(dateKey) {
  const dow = weekdayIndex(dateKey);
  return dow >= 1 && dow <= 5;
}

function listWeekdays(startKey, dueKey) {
  const out = [];
  let cur = startKey;
  while (cur <= dueKey) {
    if (isWeekday(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function resolveCardWindow(card) {
  const due = toWorkDateKey(card?.dueDate);
  const start = toWorkDateKey(card?.startDate) || due;
  const end = due || start;
  if (!start || !end) return null;
  return { start, end };
}

/**
 * @returns {Record<string, number>} map YYYY-MM-DD → hours
 */
export function spreadCardHours(card) {
  const hours = Number(card?.estimateHours);
  if (!Number.isFinite(hours) || hours <= 0) return {};
  const window = resolveCardWindow(card);
  if (!window) return {};
  if (window.start > window.end) return {};

  const days = listWeekdays(window.start, window.end);
  if (!days.length) {
    return { [window.start]: roundHours(hours, 4) };
  }
  const per = roundHours(hours / days.length, 4);
  const map = {};
  for (const day of days) map[day] = per;
  return map;
}

/**
 * Đặt khung giờ ảo trong ngày: xếp chồng từ 09:00 theo thứ tự blocks.
 * @param {Array<{ id: string, hours: number, title?: string, [k: string]: unknown }>} blocks
 * @param {string} dateKey YYYY-MM-DD
 * @returns {Array<object>} blocks với startAt/endAt Date (local)
 */
export function placeVirtualWorkBlocks(blocks, dateKey, opts = {}) {
  const startHour = opts.startHour ?? CALENDAR_WORKDAY_START_HOUR;
  const list = Array.isArray(blocks) ? blocks : [];
  let cursorMins = startHour * 60;
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return [];

  return list.map((b) => {
    const hours = Number(b.hours) || 0;
    const durationMins = Math.max(15, Math.round(hours * 60));
    const startAt = new Date(y, m - 1, d, 0, 0, 0, 0);
    startAt.setMinutes(cursorMins);
    const endAt = new Date(startAt.getTime() + durationMins * 60 * 1000);
    cursorMins += durationMins;
    return {
      ...b,
      date: dateKey,
      startAt,
      endAt,
      hours,
      durationMins,
    };
  });
}

export function sumHoursForDate(events, dateKey) {
  return roundHours(
    (events || [])
      .filter((e) => e?.date === dateKey && (e.kind === 'work' || e.type === 'work'))
      .reduce((acc, e) => acc + (Number(e.hours) || 0), 0),
    2
  );
}
