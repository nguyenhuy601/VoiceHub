/**
 * Auto project code: {LOAI}-{DEPT_KW}-{NAME_KW}-{YYYYMMDD}
 * LOAI = ORG | DEP | TEAM | DIV from scopeType (ORG for org-level projects).
 */
const { slugifyRoleKey } = require('./roleKeySlug');

const PROJECT_CODE_MAX_LEN = 64;
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
 * Keyword từ tên phòng/team: token cuối ≤6 → upper; không thì viết tắt chữ cái đầu (max 6).
 * @param {unknown} scopeLabel
 * @returns {string}
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
 * Từ title: ≤2 token đầu, upper, nối không `_`, max 12.
 * @param {unknown} title
 * @returns {string}
 */
function nameKeyword(title) {
  const slug = slugifyRoleKey(title);
  if (!slug || slug === 'role') return 'PROJECT';
  const parts = slug.split('_').filter(Boolean).slice(0, 2);
  let joined = parts.join('').toUpperCase();
  if (joined.length > 12) joined = joined.slice(0, 12);
  return joined || 'PROJECT';
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
 * @param {{ title?: string, scopeType?: string, scopeLabel?: string, dueDate?: unknown, now?: Date|string|number }} [opts]
 * @returns {string}
 */
function buildProjectCodeBase(opts = {}) {
  const loai = scopeTypeCode(opts.scopeType);
  const dept = deptKeyword(opts.scopeLabel);
  const name = nameKeyword(opts.title);
  const ymd = formatYmd(opts.dueDate, opts.now);
  return `${loai}-${dept}-${name}-${ymd}`.slice(0, PROJECT_CODE_MAX_LEN);
}

/**
 * base, rồi base-2, base-3, …
 * @param {string} base
 * @param {Iterable<string>|Set<string>|string[]} existingCodes
 * @returns {string}
 */
function allocateUniqueProjectCode(base, existingCodes) {
  const taken =
    existingCodes instanceof Set
      ? existingCodes
      : new Set(
          [...(existingCodes || [])]
            .map((c) => String(c || '').trim())
            .filter(Boolean)
        );
  const stem = String(base || '').trim() || 'ORG-UNIT-PROJECT-00000000';
  if (!taken.has(stem)) return stem.slice(0, PROJECT_CODE_MAX_LEN);

  let n = 2;
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
  SCOPE_TYPE_CODE,
  scopeTypeCode,
  deptKeyword,
  nameKeyword,
  formatYmd,
  buildProjectCodeBase,
  allocateUniqueProjectCode,
};
