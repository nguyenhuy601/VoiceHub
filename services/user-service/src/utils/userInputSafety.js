const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isObjectIdString(value) {
  return typeof value === 'string' && OBJECT_ID_RE.test(value.trim());
}

/** String-cast id từ body/params; chặn object (`{ $ne: … }`) và mảng để không lọt operator Mongo. */
function toPlainId(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toBoundedInt(raw, { min, max, fallback }) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * @param {object} query
 * @param {{ maxLimit?: number, maxPage?: number, defaultLimit?: number }} [opts]
 * @returns {{ page: number, limit: number }}
 */
function readPagination(query, { maxLimit = 50, maxPage = 100, defaultLimit = 20 } = {}) {
  const q = query && typeof query === 'object' ? query : {};
  const fallbackLimit = Math.min(defaultLimit, maxLimit);
  return {
    page: toBoundedInt(q.page, { min: 1, max: maxPage, fallback: 1 }),
    limit: toBoundedInt(q.limit, { min: 1, max: maxLimit, fallback: fallbackLimit }),
  };
}

function maskEmailForLog(email) {
  const raw = String(email || '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at < 1) return raw ? '***' : '';
  return `${raw.slice(0, Math.min(2, at))}***${raw.slice(at)}`;
}

module.exports = {
  isObjectIdString,
  toPlainId,
  readPagination,
  maskEmailForLog,
};
