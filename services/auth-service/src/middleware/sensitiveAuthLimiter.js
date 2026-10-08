const rateLimit = require('express-rate-limit');
const { sendServiceError } = require('./sendServiceError');

function readPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Giới hạn theo IP (req.ip — cần TRUST_PROXY khớp số proxy) cho route public gửi mail / dùng token. */
function createSensitiveAuthLimiter(env = process.env) {
  return rateLimit({
    windowMs: readPositiveInt(env.AUTH_SENSITIVE_RATE_WINDOW_MS, 15 * 60 * 1000),
    max: readPositiveInt(env.AUTH_SENSITIVE_RATE_MAX, 10),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      sendServiceError(res, 429, {
        errorCode: 'AUTH_RATE_LIMITED',
        messageUser: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
        message: 'Too many requests',
      }),
  });
}

/**
 * Trần thao tác mật khẩu / phiên do quản trị bấm.
 * Khóa theo id người đang đăng nhập, không theo IP — tránh trộn với quên mật khẩu
 * và tránh gộp mọi quản trị đứng sau cùng một proxy.
 */
function createAdminAccountLimiter(env = process.env) {
  return rateLimit({
    windowMs: readPositiveInt(env.AUTH_ADMIN_ACCOUNT_RATE_WINDOW_MS, 10 * 60 * 1000),
    max: readPositiveInt(env.AUTH_ADMIN_ACCOUNT_RATE_MAX, 20),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const actorId = String(req.user?.id || req.user?.userId || '').trim();
      return actorId || 'missing-user';
    },
    handler: (req, res) =>
      sendServiceError(res, 429, {
        errorCode: 'AUTH_RATE_LIMITED',
        messageUser: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.',
        message: 'Too many requests',
      }),
  });
}

module.exports = { createSensitiveAuthLimiter, createAdminAccountLimiter };
