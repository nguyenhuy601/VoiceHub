const crypto = require('crypto');

const MAX_TOKEN_LENGTH = 256;

function hashOneTimeToken(raw) {
  return crypto.createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

/** Token cũ (trước Wave 6c) còn lưu plaintext trong DB — tra cả hai dạng đến khi hết hạn. */
function oneTimeTokenQuery(raw) {
  return { $in: [hashOneTimeToken(raw), String(raw)] };
}

/** Chỉ nhận string 1..256 ký tự; mọi kiểu khác (object toán tử Mongo, mảng, số) → null. */
function readTokenInput(value) {
  if (typeof value !== 'string') return null;
  const token = value.trim();
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  return token;
}

module.exports = {
  hashOneTimeToken,
  oneTimeTokenQuery,
  readTokenInput,
  MAX_TOKEN_LENGTH,
};
