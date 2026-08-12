/**
 * Auto project code — mirror shared/utils/projectCodeGenerate.js (ESM for Vite).
 * Viết tắt chữ cái đầu tên dự án: "Sales Management" → SM; trùng → SM-1, SM-2.
 */

const PROJECT_CODE_MAX_LEN = 64;
const PROJECT_CODE_ACRONYM_MAX = 12;
const SLUG_FALLBACK = 'role';

export const SCOPE_TYPE_CODE = Object.freeze({
  organization: 'ORG',
  department: 'DEP',
  team: 'TEAM',
  division: 'DIV',
});

function slugify(raw) {
  let s = String(raw || '')
    .trim()
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd');
  s = s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return s || SLUG_FALLBACK;
}

export function scopeTypeCode(scopeType) {
  const t = String(scopeType || '').trim().toLowerCase();
  return SCOPE_TYPE_CODE[t] || 'ORG';
}

/** @deprecated Giữ export tương thích */
export function deptKeyword(scopeLabel) {
  const slug = slugify(scopeLabel);
  if (!slug || slug === SLUG_FALLBACK) return 'UNIT';
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

export function nameKeyword(title) {
  const slug = slugify(title);
  if (!slug || slug === SLUG_FALLBACK) return 'PRJ';
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

export function formatYmd(dateLike, now = new Date()) {
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

export function buildProjectCodeBase(opts = {}) {
  return nameKeyword(opts.title).slice(0, PROJECT_CODE_MAX_LEN);
}

export function allocateUniqueProjectCode(base, existingCodes) {
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
    if (n > 10000) return `${stem}-${Date.now()}`.slice(0, PROJECT_CODE_MAX_LEN);
  }
}

export { PROJECT_CODE_MAX_LEN, PROJECT_CODE_ACRONYM_MAX };
