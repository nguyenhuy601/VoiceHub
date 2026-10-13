const { sendServiceError } = require('./sendServiceError');
const { logSecurityEvent } = require('../utils/securityEventLog');

/**
 * Guard nhẹ chống CSRF cho các endpoint dựa vào HttpOnly cookie.
 * Yêu cầu FE gửi header `X-VoiceHub-Client: 1`.
 */
function requireClientHeader(options = {}) {
  const headerName = String(options.headerName || 'X-VoiceHub-Client').trim();
  const expected = String(options.expected || '1').trim();

  return (req, res, next) => {
    const actual = String(req.headers?.[headerName.toLowerCase()] || '').trim();
    if (actual !== expected) {
      logSecurityEvent({
        type: 'csrf_header_invalid',
        ip: String(req.ip || '').trim() || null,
        errorCode: 'AUTH_CSRF_INVALID',
      });
      return sendServiceError(res, 403, {
        errorCode: 'AUTH_CSRF_INVALID',
        messageUser: 'Phiên đăng nhập không hợp lệ. Vui lòng thử lại.',
        message: 'CSRF header missing or invalid',
      });
    }
    return next();
  };
}

module.exports = requireClientHeader;

