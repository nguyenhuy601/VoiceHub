const crypto = require('crypto');

/**
 * So sánh GATEWAY_INTERNAL_TOKEN constant-time.
 * Băm SHA-256 trước để hai buffer luôn cùng độ dài — timingSafeEqual không throw
 * và không lộ độ dài token qua thời gian phản hồi.
 */
function compareGatewayToken(got, expected) {
  const expectedStr = String(expected || '').trim();
  const gotStr = String(got || '').trim();
  if (!expectedStr || !gotStr) return false;
  const a = crypto.createHash('sha256').update(gotStr).digest();
  const b = crypto.createHash('sha256').update(expectedStr).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = { compareGatewayToken };
