const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const INTERNAL_ERROR_CODE = 'USER_INTERNAL_ERROR';
const GENERIC_INTERNAL_MESSAGE = 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.';
const GENERIC_BAD_REQUEST_MESSAGE = 'Yêu cầu không hợp lệ.';

function isSafeErrorCode(code) {
  return typeof code === 'string' && SAFE_ERROR_CODE.test(code);
}

function mappedError(statusCode, errorCode, messageUser) {
  return { statusCode, errorCode, messageUser, message: messageUser };
}

function isDuplicateKeyError(err) {
  return Number(err?.code) === 11000 || /E11000/.test(String(err?.message || ''));
}

function duplicateKeyField(err) {
  const pattern = err?.keyPattern && typeof err.keyPattern === 'object' ? Object.keys(err.keyPattern) : [];
  const value = err?.keyValue && typeof err.keyValue === 'object' ? Object.keys(err.keyValue) : [];
  const fromMeta = [...pattern, ...value][0];
  if (fromMeta) return fromMeta;
  const match = String(err?.message || '').match(/index:\s*([A-Za-z0-9_.]+)/);
  return match ? match[1].replace(/_\d+$/, '') : '';
}

function mapDuplicateKey(err) {
  const field = duplicateKeyField(err);
  if (/^phone/i.test(field)) {
    return mappedError(409, 'USER_PHONE_UNAVAILABLE', 'Số điện thoại này không thể sử dụng.');
  }
  if (/^email/i.test(field)) {
    return mappedError(409, 'USER_EMAIL_EXISTS', 'Email này không thể sử dụng.');
  }
  if (/^username/i.test(field)) {
    return mappedError(409, 'USER_USERNAME_EXISTS', 'Tên người dùng này không thể sử dụng.');
  }
  return mappedError(409, 'USER_CONFLICT', 'Dữ liệu bị trùng, không thể lưu.');
}

function mapMulterError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return mappedError(413, 'USER_UPLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép (5MB).');
  }
  return mappedError(400, 'USER_UPLOAD_INVALID', 'File tải lên không hợp lệ.');
}

/**
 * Chuẩn hóa lỗi trước khi trả client: chỉ lỗi nghiệp vụ (errorCode UPPER_SNAKE) giữ message 4xx;
 * lỗi Mongo / driver / body-parser / multer đổi thành mã cố định, không lộ message nội bộ
 * (ví dụ `E11000 ... phoneBlindIndex dup key` cho phép dò số điện thoại đã đăng ký).
 */
function toUserError(err, fallbackStatus = 500, fallbackMessage, fallbackCode) {
  if (!err || typeof err !== 'object') {
    return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
  }

  const name = String(err.name || '');
  if (name === 'CastError' || name === 'BSONError' || name === 'BSONTypeError') {
    return mappedError(400, 'USER_INVALID_ID', 'Mã định danh không hợp lệ.');
  }
  if (isDuplicateKeyError(err)) {
    return mapDuplicateKey(err);
  }
  if (name === 'ValidationError') {
    return mappedError(400, 'USER_VALIDATION_ERROR', 'Dữ liệu hồ sơ không hợp lệ.');
  }
  if (name === 'MulterError') {
    return mapMulterError(err);
  }
  if (err.type === 'entity.too.large') {
    return mappedError(413, 'USER_PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn.');
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return mappedError(400, 'USER_INVALID_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON.');
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
    const messageUser =
      String(err.messageUser || err.message || '').trim() || GENERIC_BAD_REQUEST_MESSAGE;
    return mappedError(statusCode, err.errorCode, messageUser);
  }

  const status = Number(fallbackStatus);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const code = isSafeErrorCode(fallbackCode) ? fallbackCode : 'USER_BAD_REQUEST';
    const message = String(fallbackMessage || '').trim() || GENERIC_BAD_REQUEST_MESSAGE;
    return mappedError(status, code, message);
  }
  return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
}

module.exports = {
  toUserError,
  isSafeErrorCode,
  INTERNAL_ERROR_CODE,
  GENERIC_INTERNAL_MESSAGE,
};
