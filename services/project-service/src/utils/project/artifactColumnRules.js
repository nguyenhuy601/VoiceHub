/**
 * Format-if-present and first-gate submit checks for Phase 1 artifact columns.
 * No DB. Empty cells are skipped. Priority stays free text.
 */

const MESSAGES = Object.freeze({
  invalid_enum: 'Invalid value',
  invalid_date: 'Invalid date',
  invalid_number: 'Invalid number',
  invalid_email: 'Invalid email',
  required_on_submit: 'Required to submit',
});

const DATE_KEYS_BY_KIND = Object.freeze({
  SCOPE: ['dateRaised'],
  WBS: ['startDate', 'endDate'],
  SCHEDULE: ['startDate', 'endDate'],
  MILESTONE: ['targetDate'],
  RELEASE: ['targetDate', 'startDate', 'endDate'],
});

const SUBMIT_KEYS_BY_KIND = Object.freeze({
  FR: ['level', 'priority'],
  NFR: ['category', 'priority'],
  SCOPE: ['scopeType', 'description'],
  BPM: ['step'],
  GLOSSARY: ['definition'],
  ASSUMPTION: ['text'],
});

function isBlank(value) {
  if (value == null) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  return false;
}

function detail(field, code) {
  return { field, code, message: MESSAGES[code] || 'Invalid value' };
}

function isAcceptableDate(value) {
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    const utc = new Date(Date.UTC(year, month - 1, day));
    return (
      utc.getUTCFullYear() === year &&
      utc.getUTCMonth() === month - 1 &&
      utc.getUTCDate() === day
    );
  }
  if (!/\d/.test(text)) return false;
  const parsed = new Date(text);
  return !Number.isNaN(parsed.getTime());
}

function pushNumber(out, field, value) {
  if (isBlank(value)) return;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) out.push(detail(field, 'invalid_number'));
}

/**
 * @param {string} kind
 * @param {object} fields
 * @returns {{ field: string, code: string, message: string }[]}
 */
function formatErrors(kind, fields) {
  const k = String(kind || '').trim().toUpperCase();
  const src = fields && typeof fields === 'object' ? fields : {};
  const out = [];

  for (const key of DATE_KEYS_BY_KIND[k] || []) {
    if (isBlank(src[key])) continue;
    if (!isAcceptableDate(src[key])) out.push(detail(key, 'invalid_date'));
  }

  if (k === 'WBS' || k === 'RESOURCE') pushNumber(out, 'effortHours', src.effortHours);
  if (k === 'DEPENDENCY') pushNumber(out, 'lagDays', src.lagDays);

  if (k === 'WBS' && !isBlank(src.assigneeEmail) && !String(src.assigneeEmail).includes('@')) {
    out.push(detail('assigneeEmail', 'invalid_email'));
  }

  return out;
}

/**
 * Identity columns when leaving draft / changes_requested for the first gate.
 * Does not require descriptive columns.
 * @param {string} kind
 * @param {object} fields
 */
function submitErrors(kind, fields) {
  const k = String(kind || '').trim().toUpperCase();
  const src = fields && typeof fields === 'object' ? fields : {};
  const keys = SUBMIT_KEYS_BY_KIND[k];
  if (!keys) return [];
  const out = [];
  for (const key of keys) {
    if (isBlank(src[key])) out.push(detail(key, 'required_on_submit'));
  }
  return out;
}

/**
 * RESOURCE.roles[].effortHours is normalized away before save.
 * Check the raw role rows so a non-numeric hour still 400s.
 */
function resourceRoleEffortErrors(kind, structured) {
  if (String(kind || '').trim().toUpperCase() !== 'RESOURCE') return [];
  const roles = structured && Array.isArray(structured.roles) ? structured.roles : [];
  const out = [];
  roles.forEach((role, index) => {
    if (!role || typeof role !== 'object') return;
    for (const err of formatErrors('RESOURCE', { effortHours: role.effortHours })) {
      out.push({ ...err, field: `roles.${index}.effortHours` });
    }
  });
  return out;
}

function raiseColumnErrors(errors, errorCode) {
  if (!Array.isArray(errors) || errors.length === 0) return;
  const err = new Error(
    errorCode === 'ARTIFACT_SUBMIT_INCOMPLETE'
      ? 'Thiếu cột bắt buộc khi gửi duyệt'
      : 'Giá trị cột không hợp lệ'
  );
  err.statusCode = 400;
  err.errorCode = errorCode;
  err.details = errors;
  throw err;
}

module.exports = {
  formatErrors,
  submitErrors,
  resourceRoleEffortErrors,
  raiseColumnErrors,
};
