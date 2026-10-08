/**
 * Text normalize for Requirement Template v2 — before compare/validate.
 * normKey: IDs, enums, headers. normProse: Description/AC/Actor (keep BA casing).
 */

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;
const SMART_QUOTES_RE = /[\u2018\u2019\u201A\u201B]/g;
const SMART_DOUBLE_QUOTES_RE = /[\u201C\u201D\u201E\u201F]/g;
const WHITESPACE_RUN_RE = /[\s\u00A0]+/g;

const LEVEL_CANONICAL = Object.freeze({
  module: 'Module',
  feature: 'Feature',
  requirement: 'Requirement',
});

const PRIORITY_CANONICAL = Object.freeze({
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  // MoSCoW → mức chuẩn của mẫu phân tích
  must: 'Critical',
  should: 'High',
  could: 'Medium',
  wont: 'Low',
  "won't": 'Low',
});

function toText(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  return String(raw);
}

function stripInvisibleAndUnicode(raw) {
  let s = toText(raw);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  try {
    s = s.normalize('NFKC');
  } catch {
    /* ignore */
  }
  s = s.replace(ZERO_WIDTH_RE, '');
  s = s.replace(/\u00A0/g, ' ');
  return s;
}

/**
 * Headers / enum compare keys (case-insensitive, collapsed space, smart quotes → ascii).
 */
function normHeader(raw) {
  return stripInvisibleAndUnicode(raw)
    .replace(SMART_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, '"')
    .trim()
    .replace(/^["']+|["']+$/g, '')
    .toLowerCase()
    .replace(WHITESPACE_RUN_RE, ' ');
}

/**
 * ID / Parent ID / Requirement ID keys → canonical FR-001 shape.
 */
function normId(raw) {
  let s = stripInvisibleAndUnicode(raw)
    .replace(SMART_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, '"')
    .trim()
    .replace(WHITESPACE_RUN_RE, '');
  if (!s) return '';
  const m = s.match(/^([A-Za-z]+)-?(.*)$/);
  if (m) {
    const prefix = m[1].toUpperCase();
    const rest = m[2];
    return rest ? `${prefix}-${rest}` : `${prefix}-`;
  }
  return s.toUpperCase();
}

/**
 * Enum / Level / Priority / Yes-No → canonical display form.
 */
function normKey(raw, { kind } = {}) {
  const base = stripInvisibleAndUnicode(raw)
    .replace(SMART_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, '"')
    .trim()
    .replace(WHITESPACE_RUN_RE, ' ');
  if (!base) return '';

  if (kind === 'id') return normId(base);

  if (kind === 'level') {
    const token = base.toLowerCase().replace(/\s+/g, '');
    return LEVEL_CANONICAL[token] || base;
  }

  if (kind === 'priority') {
    const token = base.toLowerCase();
    return PRIORITY_CANONICAL[token] || base;
  }

  if (kind === 'bool') {
    const token = base.toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(token)) return 'Yes';
    if (['no', 'n', 'false', '0'].includes(token)) return 'No';
    return base;
  }

  if (kind === 'header') return normHeader(base);

  return base.toLowerCase().replace(WHITESPACE_RUN_RE, ' ');
}

/**
 * Prose: keep casing; trim + collapse whitespace; strip invisible.
 */
function normProse(raw) {
  return stripInvisibleAndUnicode(raw)
    .trim()
    .replace(WHITESPACE_RUN_RE, ' ');
}

const SCOPE_IN = new Set(['in', 'inscope', 'trong', 'trongphamvi', 'trong phạm vi']);
const SCOPE_OUT = new Set(['out', 'outofscope', 'ngoai', 'ngoaiphamvi', 'ngoài', 'ngoài phạm vi']);

/**
 * in / out khi khớp danh sách; giá trị khác giữ nguyên để BA tự nhập.
 */
function normalizeScopeType(raw) {
  const base = stripInvisibleAndUnicode(raw)
    .replace(SMART_QUOTES_RE, "'")
    .replace(SMART_DOUBLE_QUOTES_RE, '"')
    .trim()
    .replace(WHITESPACE_RUN_RE, ' ');
  if (!base) return '';
  const token = base.toLowerCase();
  const compact = token.replace(/\s+/g, '');
  if (SCOPE_OUT.has(token) || SCOPE_OUT.has(compact) || token === 'out' || token.startsWith('out of')) {
    return 'out';
  }
  if (SCOPE_IN.has(token) || SCOPE_IN.has(compact) || token === 'in' || token.startsWith('in scope')) {
    return 'in';
  }
  return base;
}

function isTruthyYes(raw) {
  const v = normKey(raw, { kind: 'bool' });
  return v === 'Yes';
}

module.exports = {
  toText,
  stripInvisibleAndUnicode,
  normHeader,
  normId,
  normKey,
  normProse,
  normalizeScopeType,
  isTruthyYes,
  LEVEL_CANONICAL,
  PRIORITY_CANONICAL,
};
