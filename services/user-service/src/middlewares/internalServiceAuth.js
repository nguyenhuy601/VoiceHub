/**
 * Xác thực gọi nội bộ (org/chat/socket → user-service).
 * Chấp nhận x-internal-token hoặc x-gateway-internal-token khớp token cấu hình.
 */
function internalServiceAuth(req, res, next) {
  const allowed = [
    String(process.env.USER_SERVICE_INTERNAL_TOKEN || '').trim(),
    String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim(),
  ].filter(Boolean);
  const unique = [...new Set(allowed)];

  if (!unique.length) {
    return res.status(503).json({
      success: false,
      message: 'Internal presence not configured on user-service',
    });
  }

  const got = String(
    req.headers['x-internal-token'] ||
      req.headers['x-gateway-internal-token'] ||
      ''
  ).trim();

  if (!got || !unique.includes(got)) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }
  next();
}

module.exports = internalServiceAuth;
