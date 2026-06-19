/**
 * Định dạng ngày/giờ theo locale app (vi | en).
 */
export function getDateLocale(locale) {
  return locale === 'en' ? 'en-US' : 'vi-VN';
}

export function formatDateForLocale(date, locale, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(getDateLocale(locale), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    ...options,
  });
}

export function formatTimeForLocale(date, locale, options = {}) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(getDateLocale(locale), {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

export function formatDateTimeForLocale(date, locale, options = {}) {
  if (!date) return '';
  return `${formatDateForLocale(date, locale, options)} ${formatTimeForLocale(date, locale, options)}`.trim();
}

/** Relative time — cần translator t() từ useAppStrings. */
export function formatRelativeTime(date, t) {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t('time.justNow');
  if (mins < 60) return t('time.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('time.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return t('time.daysAgo', { n: days });
}

export const LOCALE_STORAGE_KEY = 'voicehub-locale';

/** Đọc locale từ localStorage (dùng ngoài React). */
export function readStoredLocale() {
  if (typeof localStorage === 'undefined') return 'vi';
  const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
  return saved === 'en' ? 'en' : 'vi';
}
