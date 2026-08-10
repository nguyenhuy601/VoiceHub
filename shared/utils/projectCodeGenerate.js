/**
 * Auto project code từ chữ cái đầu của từng từ trong tên dự án.
 * Ví dụ: "Sales Management" → SM, "Customer Relationship Management" → CRM.
 * Trùng: CRM, CRM-1, CRM-2, …
 */
const { slugifyRoleKey } = require('./roleKeySlug');

const PROJECT_CODE_MAX_LEN = 64;
const PROJECT_CODE_ACRONYM_MAX = 12;
const SCOPE_TYPE_CODE = Object.freeze({
  organization: 'ORG',
  department: 'DEP',
  team: 'TEAM',
  division: 'DIV',
});

function scopeTypeCode(scopeType) {
  const t = String(scopeType || '').trim().toLowerCase();
  return SCOPE_TYPE_CODE[t] || 'ORG';
}

/**
 * @deprecated Giữ export tương thích; mã dự án mới không dùng scope label.
 */
function deptKeyword(scopeLabel) {
  const slug = slugifyRoleKey(scopeLabel);
  if (!slug || slug === 'role') return 'UNIT';
  const parts = slug.split('_').filter(Boolean);
  if (!parts.length) return 'UNIT';
  const last = parts[parts.length - 1];
  if (last.length <= 6) return last.toUpperCase();
  const ac = parts
    .map((p) => p[0])
    .join('')
    .slice(0, 6)
    .toUpperCase();
  return ac || 'UNIT';
}

/**
 * Viết tắt: chữ cái đầu mỗi từ (sau slug). Một từ → tối đa 3 chữ cái đầu.
 * @param {unknown} title
 * @returns {string}
 */
function nameKeyword(title) {
  const slug = slugifyRoleKey(title);
  if (!slug || slug === 'role') return 'PRJ';
  const parts = slug.split('_').filter(Boolean);
  if (!parts.length) return 'PRJ';
  if (parts.length === 1) {
    return parts[0].slice(0, 3).toUpperCase() || 'PRJ';
  }
  const ac = parts
    .map((p) => p[0])
    .join('')
    .slice(0, PROJECT_CODE_ACRONYM_MAX)
    .toUpperCase();
  return ac || 'PRJ';
}

/**
 * @param {unknown} dateLike
 * @param {Date|string|number} [now]
 * @returns {string} YYYYMMDD
 */
function formatYmd(dateLike, now = new Date()) {
  let d;
  if (dateLike !== undefined && dateLike !== null && String(dateLike).trim() !== '') {
    d = new Date(dateLike);
    if (Number.isNaN(d.getTime())) {
      d = now instanceof Date ? now : new Date(now);
    }
  } else {
    d = now instanceof Date ? now : new Date(now);
  }
  if (Number.isNaN(d.getTime())) d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

/**
 * Mã dự án = viết tắt tên. opts.scopeType / scopeLabel / dueDate bị bỏ qua (giữ signature).
 * @param {{ title?: string }} [opts]
 * @returns {string}
 */
function buildProjectCodeBase(opts = {}) {
  return nameKeyword(opts.title).slice(0, PROJECT_CODE_MAX_LEN);
}

/**
 * base, rồi base-1, base-2, …
 * @param {string} base
 * @param {Iterable<string>|Set<string>|string[]} existingCodes
 * @returns {string}
 */
function allocateUniqueProjectCode(base, existingCodes) {
  const taken =
    existingCodes instanceof Set
      ? new Set([...existingCodes].map((c) => String(c || '').trim().toUpperCase()).filter(Boolean))
      : new Set(
          [...(existingCodes || [])]
            .map((c) => String(c || '').trim().toUpperCase())
            .filter(Boolean)
        );
  const stem = String(base || '').trim().toUpperCase() || 'PRJ';
  if (!taken.has(stem)) return stem.slice(0, PROJECT_CODE_MAX_LEN);

  let n = 1;
  for (;;) {
    const candidate = `${stem}-${n}`.slice(0, PROJECT_CODE_MAX_LEN);
    if (!taken.has(candidate)) return candidate;
    n += 1;
    if (n > 10000) {
      return `${stem}-${Date.now()}`.slice(0, PROJECT_CODE_MAX_LEN);
    }
  }
}

module.exports = {
  PROJECT_CODE_MAX_LEN,
  PROJECT_CODE_ACRONYM_MAX,
  SCOPE_TYPE_CODE,
  scopeTypeCode,
  deptKeyword,
  nameKeyword,
  formatYmd,
  buildProjectCodeBase,
  allocateUniqueProjectCode,
};
