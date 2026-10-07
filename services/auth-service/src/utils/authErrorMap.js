const crypto = require('crypto');

const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const INTERNAL_ERROR_CODE = 'AUTH_INTERNAL_ERROR';
const GENERIC_INTERNAL_MESSAGE = 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.';

function isSafeErrorCode(code) {
  return typeof code === 'string' && SAFE_ERROR_CODE.test(code);
}

function mappedError(statusCode, errorCode, messageUser) {
  return { statusCode, errorCode, messageUser, message: messageUser };
}

/**
 * Chuẩn hóa lỗi trước khi trả client: chỉ lỗi nghiệp vụ (có errorCode UPPER_SNAKE) giữ message;
 * lỗi thư viện (Mongo, bcrypt, URIError, body-parser) đổi thành mã cố định, không lộ message nội bộ.
 */
function toAuthError(err, fallbackStatus = 500) {
  if (!err || typeof err !== 'object') {
    return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
  }

  const name = String(err.name || '');
  if (name === 'CastError' || name === 'BSONError' || name === 'BSONTypeError') {
    return mappedError(400, 'AUTH_INVALID_ID', 'Mã định danh không hợp lệ.');
  }
  if (err instanceof URIError) {
    return mappedError(401, 'AUTH_INVALID_TOKEN', 'Mã xác thực không hợp lệ hoặc đã hết hạn.');
  }
  if (err.type === 'entity.too.large') {
    return mappedError(413, 'AUTH_PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn.');
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return mappedError(400, 'AUTH_INVALID_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON.');
  }

  if (isSafeErrorCode(err.errorCode)) {
    const rawStatus = Number(err.statusCode);
    const statusCode =
      Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
        ? rawStatus
        : Number(fallbackStatus) || 500;
    if (statusCode >= 500) {
      return mappedError(statusCode, err.errorCode, GENERIC_INTERNAL_MESSAGE);
    }
    const messageUser = String(err.messageUser || err.message || '').trim() || 'Yêu cầu không hợp lệ.';
    return mappedError(statusCode, err.errorCode, messageUser);
  }

  return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
}

function timingSafeStringEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  toAuthError,
  isSafeErrorCode,
  timingSafeStringEquals,
  INTERNAL_ERROR_CODE,
  GENERIC_INTERNAL_MESSAGE,
};
