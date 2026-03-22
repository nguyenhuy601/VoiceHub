const {
  isEncrypted,
  encryptField,
  decryptFieldSafe,
  isEncryptionEnabled,
} = require('./fieldCrypto');
const { recordLazyMigrate, recordEncryptedRatio } = require('./cryptoMetrics');

/**
 * Đọc giá trị: plaintext legacy hoặc đã mã hóa → luôn trả plaintext cho API.
 */
function unwrapPlaintext(stored) {
  if (stored === undefined || stored === null) return stored;
  if (typeof stored !== 'string') return stored;
  if (!isEncrypted(stored)) return stored;
  return decryptFieldSafe(stored, '');
}

/**
 * Lazy migration: nếu có plaintext và có bật ENCRYPTION_MASTER_KEY → trả về object cập nhật để $set.
 */
function lazyEncryptField(fieldName, storedValue) {
  if (!isEncryptionEnabled()) return { value: unwrapPlaintext(storedValue), needsPersist: false };
  recordEncryptedRatio(isEncrypted(storedValue));

  if (storedValue === undefined || storedValue === null) {
    return { value: storedValue, needsPersist: false };
  }
  if (typeof storedValue !== 'string') {
    return { value: storedValue, needsPersist: false };
  }
  if (isEncrypted(storedValue)) {
    return { value: decryptFieldSafe(storedValue, ''), needsPersist: false };
  }
  const enc = encryptField(storedValue);
  recordLazyMigrate();
  return { value: storedValue, needsPersist: true, encrypted: enc };
}

module.exports = {
  unwrapPlaintext,
  lazyEncryptField,
};
