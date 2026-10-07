const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 12;

/**
 * Hash password
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
const hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hashedPassword = await bcrypt.hash(password, salt);
    return hashedPassword;
  } catch (error) {
    console.error('[auth-service] hashPassword failed:', error?.code || error?.name || 'unknown');
    throw new Error('Password hashing failed');
  }
};

/**
 * Compare password with hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
const comparePassword = async (password, hash) => {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  try {
    const isMatch = await bcrypt.compare(password, hash);
    return isMatch;
  } catch (error) {
    console.error('[auth-service] comparePassword failed:', error?.code || error?.name || 'unknown');
    throw new Error('Password comparison failed');
  }
};

/** bcrypt chỉ dùng 72 byte đầu — dài hơn sẽ bị cắt âm thầm. */
const MAX_PASSWORD_BYTES = 72;

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} Validation result
 */
const validatePasswordStrength = (rawPassword) => {
  const password = typeof rawPassword === 'string' ? rawPassword : '';
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    return {
      isValid: false,
      errors: [`Password must be at most ${MAX_PASSWORD_BYTES} bytes long`],
      errorCode: 'AUTH_PASSWORD_TOO_LONG',
    };
  }
  const minLength = 8;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];

  if (password.length < minLength) {
    errors.push(`Password must be at least ${minLength} characters long`);
  }
  if (!hasUpperCase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!hasLowerCase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!hasNumbers) {
    errors.push('Password must contain at least one number');
  }
  if (!hasSpecialChar) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
    ...(errors.length ? { errorCode: 'AUTH_WEAK_PASSWORD' } : {}),
  };
};

/**
 * Mật khẩu tạm đạt đủ rule validatePasswordStrength (khác base64url — thiếu ký tự đặc biệt).
 */
const generateTemporaryPassword = (length = 12) => {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const pick = (alphabet) => alphabet[crypto.randomInt(0, alphabet.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
  const targetLen = Math.max(8, Number(length) || 12);
  while (chars.length < targetLen) {
    chars.push(pick(all));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

module.exports = {
  hashPassword,
  comparePassword,
  validatePasswordStrength,
  generateTemporaryPassword,
  MAX_PASSWORD_BYTES,
};




