/**
 * Hiển thị tên phòng ban / kênh: dữ liệu cũ seed tiếng Việt trong DB → map sang tiếng Anh khi locale là `en`.
 * Tổ chức mới (seed EN) và tên tùy chỉnh của user giữ nguyên nếu không có trong map.
 */

const DEPT_VI_TO_EN = {
  'Nhân sự': 'Human Resources',
  'Kế toán': 'Accounting',
  'Kinh doanh': 'Sales',
  'Vận hành': 'Operations',
};

/** Slug kênh mặc định cũ (tiếng Việt) → slug hiển thị khi UI English */
const CHANNEL_SLUG_VI_TO_EN = {
  'chat-chung': 'general',
  'voice-chung': 'voice',
};

export function displayDepartmentName(name, locale) {
  if (name == null || name === '') return name;
  const s = String(name).trim();
  if (locale !== 'en') return s;
  return DEPT_VI_TO_EN[s] ?? s;
}

/**
 * Slug kênh cho breadcrumb / tab (#name) — ký tự an toàn URL, không đổi id phía server.
 */
export function channelNameToDisplaySlug(name, locale) {
  const base = String(name || 'chat')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  if (locale !== 'en') return base;
  return CHANNEL_SLUG_VI_TO_EN[base] ?? base;
}

/** Mô tả seed EN kiểu "Departmental text chat" — dùng i18n thay vì raw. */
export function resolveChannelHeaderDescription(channel, fallback = '') {
  const raw = String(channel?.description || channel?.topic || '').trim();
  if (!raw) return fallback;
  const normalized = raw.toLowerCase().replace(/\s+/g, ' ');
  if (/department(al)? (text |voice )?(chat|channel)/.test(normalized)) {
    return fallback;
  }
  return raw;
}
