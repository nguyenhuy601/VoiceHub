/**
 * POST tạo notification từ webhook / service nội bộ — chỉ dùng NOTIFICATION_INTERNAL_TOKEN
 * (không fallback sang GATEWAY_INTERNAL_TOKEN để tách ranh giới bảo mật).
 */
const { compareGatewayToken } = require('@enterprise/shared/middleware/compareGatewayToken');
const { sendServiceError } = require('./sendServiceError');

function internalNotificationAuth(req, res, next) {
  const expected = String(process.env.NOTIFICATION_INTERNAL_TOKEN || '').trim();
  if (!expected) {
    return sendServiceError(res, 503, {
      errorCode: 'NOTIFICATION_INTERNAL_AUTH_UNCONFIGURED',
      message: 'Internal notification auth not configured',
    });
  }
  const got = String(
    req.headers['x-internal-notification-token'] || req.headers['x-internal-token'] || ''
  ).trim();
  if (!compareGatewayToken(got, expected)) {
    return sendServiceError(res, 401, {
      errorCode: 'NOTIFICATION_UNAUTHORIZED',
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = internalNotificationAuth;
