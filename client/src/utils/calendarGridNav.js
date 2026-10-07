/** Điều hướng bàn phím lưới tháng (APG date grid): ngày ±1/±7, đầu/cuối tuần, ±1 tháng. */

const DAY_DELTA_BY_KEY = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDateKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function shiftMonthClamped(date, delta) {
  const target = new Date(date.getFullYear(), date.getMonth() + delta, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/**
 * @param {string} dateKey YYYY-MM-DD (local)
 * @param {string} key KeyboardEvent.key
 * @param {{ weekStartsOn?: number }} [opts] 0 = Chủ nhật
 * @returns {{ dateKey: string, monthDelta: number } | null} null nếu phím không xử lý
 */
export function resolveCalendarGridNav(dateKey, key, { weekStartsOn = 0 } = {}) {
  const current = parseDateKey(dateKey);
  if (!current) return null;

  let next = null;
  if (key in DAY_DELTA_BY_KEY) {
    next = new Date(current);
    next.setDate(current.getDate() + DAY_DELTA_BY_KEY[key]);
  } else if (key === 'Home' || key === 'End') {
    const offsetFromWeekStart = (current.getDay() - weekStartsOn + 7) % 7;
    next = new Date(current);
    next.setDate(current.getDate() - offsetFromWeekStart + (key === 'End' ? 6 : 0));
  } else if (key === 'PageUp') {
    next = shiftMonthClamped(current, -1);
  } else if (key === 'PageDown') {
    next = shiftMonthClamped(current, 1);
  }
  if (!next) return null;

  const monthDelta =
    (next.getFullYear() - current.getFullYear()) * 12 + (next.getMonth() - current.getMonth());
  return { dateKey: formatDateKey(next), monthDelta };
}
