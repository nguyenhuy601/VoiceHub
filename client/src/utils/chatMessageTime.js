/**
 * Ngày/giờ tin nhắn kiểu Zalo: divider `T2 24/08/2026`, giờ `HH:mm` (24h).
 */

const WEEKDAY_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const WEEKDAY_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function toValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function messageDayKey(value) {
  const d = toValidDate(value);
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function shouldShowChatDayDivider(currentCreatedAt, previousCreatedAt) {
  const cur = messageDayKey(currentCreatedAt);
  if (!cur) return false;
  if (!previousCreatedAt) return true;
  return cur !== messageDayKey(previousCreatedAt);
}

/** Giờ trong bubble / pill — 24h như Zalo. */
export function formatChatClockTime(value) {
  const d = toValidDate(value);
  if (!d) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Divider giữa các ngày: `T2 24/08/2026` (vi) / `Mon 24/08/2026` (en).
 * @param {string|Date} value
 * @param {'vi'|'en'} [locale]
 */
export function formatChatDateDividerLabel(value, locale = 'vi') {
  const d = toValidDate(value);
  if (!d) return '';
  const weekday =
    locale === 'en' ? WEEKDAY_EN[d.getDay()] : WEEKDAY_VI[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${weekday} ${dd}/${mm}/${yyyy}`;
}
