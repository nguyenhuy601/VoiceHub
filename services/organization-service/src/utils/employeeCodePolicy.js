/**
 * Convention mã NV VoiceHub (một SoT cho mời tay + Excel).
 * Format: VH-{seq padded} — VD VH-001, VH-211.
 */

const DEFAULT_PREFIX = String(process.env.EMPLOYEE_CODE_PREFIX || 'VH-').toUpperCase();
const PAD = Math.max(1, Math.min(6, Number(process.env.EMPLOYEE_CODE_PAD || 3) || 3));

function formatEmployeeCode(seq, prefix = DEFAULT_PREFIX) {
  const n = Math.floor(Number(seq));
  if (!Number.isFinite(n) || n < 1) return null;
  return `${prefix}${String(n).padStart(PAD, '0')}`;
}

function parseSeqFromCode(code, prefix = DEFAULT_PREFIX) {
  const raw = String(code || '')
    .trim()
    .toUpperCase();
  const p = String(prefix || DEFAULT_PREFIX).toUpperCase();
  if (!raw.startsWith(p)) return null;
  const rest = raw.slice(p.length);
  if (!/^\d+$/.test(rest)) return null;
  const n = Number(rest);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/**
 * Chuẩn hóa mã NV về VH-001…
 * - Cho phép VH-001 hoặc VH001 (thiếu gạch) → VH-001
 * - allowEmpty: Excel để trống → value null (service sẽ auto-allocate)
 * @returns {{ ok:true, value:string|null, empty?:boolean } | { ok:false, value:null, errorCode:string, message:string }}
 */
function canonicalizeEmployeeCode(raw, options = {}) {
  const allowEmpty = Boolean(options.allowEmpty);
  const prefix = String(options.prefix || DEFAULT_PREFIX).toUpperCase();
  const original = String(raw ?? '').trim();

  if (!original) {
    if (allowEmpty) return { ok: true, value: null, empty: true };
    return {
      ok: false,
      value: null,
      errorCode: 'VALIDATION_EMPLOYEE_CODE_REQUIRED',
      message:
        'employeeCode bắt buộc dạng VH-001 (cùng mã mời tay), hoặc để trống để hệ thống tự cấp.',
    };
  }

  if (/\s/.test(original)) {
    return {
      ok: false,
      value: null,
      errorCode: 'VALIDATION_EMPLOYEE_CODE_FORMAT',
      message: 'employeeCode không được có khoảng trắng. Dùng VH-001.',
    };
  }

  let s = original.toUpperCase();
  let m = s.match(new RegExp(`^${escapeRegex(prefix)}0*(\\d+)$`));
  if (!m && prefix.endsWith('-')) {
    const bare = prefix.slice(0, -1);
    m = s.match(new RegExp(`^${escapeRegex(bare)}0*(\\d+)$`));
  }

  if (!m) {
    return {
      ok: false,
      value: null,
      errorCode: 'VALIDATION_EMPLOYEE_CODE_FORMAT',
      message: `employeeCode phải dạng ${prefix}001 (ví dụ ${prefix}001, ${prefix}211). Không dùng NV001 / mã lệch convention.`,
    };
  }

  const seq = Number(m[1]);
  if (!Number.isFinite(seq) || seq < 1) {
    return {
      ok: false,
      value: null,
      errorCode: 'VALIDATION_EMPLOYEE_CODE_FORMAT',
      message: 'employeeCode số thứ tự không hợp lệ.',
    };
  }

  const value = formatEmployeeCode(seq, prefix);
  return { ok: true, value, empty: false };
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  DEFAULT_PREFIX,
  PAD,
  formatEmployeeCode,
  parseSeqFromCode,
  canonicalizeEmployeeCode,
};
