const OBJECT_ID_PATTERN = /^[a-f0-9]{24}$/i;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function isObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

/** `alice@example.com` → `a***@example.com` (log không chứa email đầy đủ). */
function maskEmailForLog(email) {
  const s = typeof email === 'string' ? email.trim() : '';
  const at = s.lastIndexOf('@');
  if (at < 1) return s ? '***' : '';
  return `${s[0]}***${s.slice(at)}`;
}

/** HR chỉ thấy IP đã che: IPv4 giữ 3 octet đầu; IPv6 giữ 4 nhóm đầu + `::`. */
function maskIpForHr(ip) {
  const raw = typeof ip === 'string' ? ip.trim() : '';
  if (!raw) return null;
  const v4 = raw.startsWith('::ffff:') ? raw.slice(7) : raw;
  const m = v4.match(IPV4_PATTERN);
  if (m) return `${m[1]}.${m[2]}.${m[3]}.x`;
  if (raw.includes(':')) {
    const groups = raw.split('::')[0].split(':').filter(Boolean).slice(0, 4);
    return `${groups.join(':')}::`;
  }
  return 'x';
}

function truncateForStore(value, maxLength) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function toOrigin(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

function readAllowedFrontendOrigins(env) {
  const list = String(env.AUTH_FRONTEND_URL_ALLOWLIST || '')
    .split(',')
    .map(toOrigin)
    .filter(Boolean);
  const fallback = toOrigin(env.FRONTEND_URL || '');
  if (fallback) list.push(fallback);
  return new Set(list);
}

/**
 * Link trong email chỉ được trỏ về origin trong allowlist (+ FRONTEND_URL);
 * ngoài danh sách → FRONTEND_URL (chống chèn domain lạ vào link đặt lại mật khẩu).
 */
function resolveSafeFrontendUrl(candidate, env = process.env) {
  const fallback = toOrigin(env.FRONTEND_URL || '') || 'http://localhost:5173';
  const origin = candidate ? toOrigin(candidate) : null;
  if (origin && readAllowedFrontendOrigins(env).has(origin)) return origin;
  return fallback;
}

/** `true`/`false` thật hoặc chuỗi "true"/"false"; mọi giá trị khác → null. */
function readBooleanStrict(value) {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return null;
}

module.exports = {
  isObjectIdString,
  maskEmailForLog,
  maskIpForHr,
  truncateForStore,
  escapeHtml,
  resolveSafeFrontendUrl,
  readBooleanStrict,
};
