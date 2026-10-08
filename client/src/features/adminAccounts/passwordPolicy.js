export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_INPUT_MAX_LENGTH = 128;
export const LOGIN_LOCK_MAX_ATTEMPTS = 5;
export const LOGIN_LOCK_HOURS = 2;

const SPECIAL_CHAR_PATTERN = /[!@#$%^&*(),.?":{}|<>]/;

function utf8ByteLength(value) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(value).length;
  return unescape(encodeURIComponent(value)).length;
}

/** Thứ tự và điều kiện khớp `validatePasswordStrength` của auth-service. */
export const PASSWORD_RULE_KEYS = ['minLength', 'upper', 'lower', 'digit', 'special', 'maxBytes'];

/**
 * @param {unknown} password
 * @returns {{ rules: Record<string, boolean>, isValid: boolean }}
 */
export function evaluatePassword(password) {
  const value = typeof password === 'string' ? password : '';
  const rules = {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    upper: /[A-Z]/.test(value),
    lower: /[a-z]/.test(value),
    digit: /\d/.test(value),
    special: SPECIAL_CHAR_PATTERN.test(value),
    maxBytes: value.length > 0 && utf8ByteLength(value) <= PASSWORD_MAX_BYTES,
  };
  return { rules, isValid: PASSWORD_RULE_KEYS.every((key) => rules[key]) };
}
