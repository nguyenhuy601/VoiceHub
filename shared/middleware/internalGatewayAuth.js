/**
 * Chỉ cho phép gọi nội bộ giữa các service (cùng GATEWAY_INTERNAL_TOKEN với API Gateway).
 */
const { sendApiError } = require('./httpErrorResponse');

function internalGatewayAuth(req, res, next) {
  const expected = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();
  if (!expected) {
    return sendApiError(res, 503, {
      errorCode: 'GATEWAY_TRUST_NOT_CONFIGURED',
      message: 'GATEWAY_INTERNAL_TOKEN is not configured',
      messageUser: 'Gateway trust chưa được cấu hình.',
    });
  }
  const got = String(req.headers['x-gateway-internal-token'] || '').trim();
  if (got !== expected) {
    return sendApiError(res, 401, {
      errorCode: 'GATEWAY_TRUST_INVALID',
      message: 'Unauthorized',
      messageUser: 'Yêu cầu không hợp lệ.',
    });
  }
  return next();
}

module.exports = internalGatewayAuth;
