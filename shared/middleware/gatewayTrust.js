/**
 * Tin `x-user-id` / `x-user-email` chỉ khi request đi qua API Gateway đã ký
 * bằng `x-gateway-internal-token` (hoặc alias `x-internal-token`) trùng `GATEWAY_INTERNAL_TOKEN`.
 */
const { sendApiError } = require('./httpErrorResponse');

const getExpectedToken = () => String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

/**
 * Middleware: nếu có `x-user-id` thì bắt buộc token gateway hợp lệ, rồi gắn req.user.
 */
function gatewayUserFromTrustedHeaders(req, res, next) {
  const uid = req.headers['x-user-id'];
  if (!uid) {
    return next();
  }

  const expected = getExpectedToken();
  if (!expected) {
    console.error(
      '[gatewayTrust] GATEWAY_INTERNAL_TOKEN chưa set — từ chối tin x-user-id (fail-closed). Cấu hình trùng api-gateway + docker-compose.'
    );
    return sendApiError(res, 503, {
      errorCode: 'GATEWAY_TRUST_NOT_CONFIGURED',
      message: 'Gateway trust not configured (set GATEWAY_INTERNAL_TOKEN on this service)',
      messageUser: 'Gateway trust chưa được cấu hình.',
    });
  }

  const got = String(
    req.headers['x-gateway-internal-token'] || req.headers['x-internal-token'] || ''
  ).trim();
  if (got !== expected) {
    return sendApiError(res, 401, {
      errorCode: 'GATEWAY_TRUST_INVALID',
      message: 'Unauthorized: invalid or missing gateway trust',
      messageUser: 'Yêu cầu không hợp lệ.',
    });
  }

  req.user = {
    ...(req.user || {}),
    id: String(uid).trim(),
    email: req.headers['x-user-email'] || req.user?.email,
  };
  return next();
}

/**
 * Kiểm tra tin cậy header forward từ gateway (dùng trong protect trước khi tin x-user-id).
 */
function isTrustedGatewayForward(req) {
  const expected = getExpectedToken();
  if (!expected) return false;
  const got = String(
    req.headers['x-gateway-internal-token'] || req.headers['x-internal-token'] || ''
  ).trim();
  return got === expected;
}

/**
 * Header cho gọi nội bộ service → service (mô phỏng forward từ gateway).
 */
function buildTrustedGatewayHeaders(userId, extra = {}) {
  const expected = getExpectedToken();
  const headers = { ...extra };
  if (userId != null && userId !== '') {
    headers['x-user-id'] = String(userId).trim();
  }
  if (expected) {
    headers['x-gateway-internal-token'] = expected;
  }
  return headers;
}

module.exports = {
  gatewayUserFromTrustedHeaders,
  isTrustedGatewayForward,
  getExpectedToken,
  buildTrustedGatewayHeaders,
};
