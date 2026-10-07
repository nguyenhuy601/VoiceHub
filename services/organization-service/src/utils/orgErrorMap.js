const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{2,63}$/;
const INTERNAL_ERROR_CODE = 'ORG_INTERNAL_ERROR';
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

const DRIVER_ERROR_NAMES = new Set([
  'CastError',
  'BSONError',
  'BSONTypeError',
  'ValidationError',
  'MongoServerError',
  'MongoError',
  'MongooseError',
  'DocumentNotFoundError',
  'StrictModeError',
  'TypeError',
  'ReferenceError',
  'RangeError',
  'AxiosError',
]);

/**
 * Chuẩn hóa lỗi trước khi trả client.
 * - Lỗi driver / Mongo / body-parser / multer → mã cố định, không lộ message nội bộ.
 * - Lỗi nghiệp vụ có `statusCode` 4xx do service tự ném → giữ message (đã viết cho người dùng).
 * - Lỗi không có `statusCode` → không bao giờ dùng `err.message` (fallback 4xx dùng fallbackMessage).
 */
function toOrgError(err, fallbackStatus = 500, fallbackMessage, fallbackCode) {
  if (!err || typeof err !== 'object') {
    return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
  }

  const name = String(err.name || '');
  if (name === 'CastError' || name === 'BSONError' || name === 'BSONTypeError') {
    return mappedError(400, 'ORG_INVALID_ID', 'Mã định danh không hợp lệ.');
  }
  if (isDuplicateKeyError(err)) {
    return mappedError(409, 'ORG_DUPLICATE', 'Dữ liệu bị trùng, không thể lưu.');
  }
  if (name === 'ValidationError') {
    return mappedError(400, 'ORG_VALIDATION_FAILED', 'Dữ liệu không hợp lệ.');
  }
  if (name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return mappedError(413, 'ORG_PAYLOAD_TOO_LARGE', 'File vượt quá dung lượng cho phép.');
    }
    return mappedError(400, 'ORG_IMPORT_FILE_INVALID', 'File tải lên không hợp lệ.');
  }
  if (err.type === 'entity.too.large') {
    return mappedError(413, 'ORG_PAYLOAD_TOO_LARGE', 'Dữ liệu gửi lên quá lớn.');
  }
  if (err.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return mappedError(400, 'ORG_INVALID_JSON', 'Dữ liệu gửi lên không đúng định dạng JSON.');
  }

  const rawStatus = Number(err.statusCode);
  const hasExplicitStatus = Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599;
  if (hasExplicitStatus && !DRIVER_ERROR_NAMES.has(name)) {
    if (rawStatus >= 500) {
      const code = isSafeErrorCode(err.errorCode) ? err.errorCode : INTERNAL_ERROR_CODE;
      return mappedError(rawStatus, code, GENERIC_INTERNAL_MESSAGE);
    }
    const code = isSafeErrorCode(err.errorCode)
      ? err.errorCode
      : isSafeErrorCode(fallbackCode) && fallbackCode !== INTERNAL_ERROR_CODE
        ? fallbackCode
        : 'ORG_BAD_REQUEST';
    const messageUser =
      String(err.messageUser || err.message || '').trim() || GENERIC_BAD_REQUEST_MESSAGE;
    return mappedError(rawStatus, code, messageUser);
  }

  const status = Number(fallbackStatus);
  if (Number.isInteger(status) && status >= 400 && status < 500) {
    const code =
      isSafeErrorCode(fallbackCode) && fallbackCode !== INTERNAL_ERROR_CODE ? fallbackCode : 'ORG_BAD_REQUEST';
    const message = String(fallbackMessage || '').trim() || GENERIC_BAD_REQUEST_MESSAGE;
    return mappedError(status, code, message);
  }
  return mappedError(500, INTERNAL_ERROR_CODE, GENERIC_INTERNAL_MESSAGE);
}

/** Lỗi nghiệp vụ 4xx ném từ util/service — `toOrgError` giữ nguyên message. */
function createOrgError(statusCode, errorCode, message) {
  return Object.assign(new Error(message), { statusCode, errorCode });
}

function maskEmail(email) {
  const s = String(email || '').trim();
  const at = s.indexOf('@');
  if (at < 1) return s ? '***' : '';
  return `${s[0]}***${s.slice(at)}`;
}

module.exports = {
  toOrgError,
  isSafeErrorCode,
  maskEmail,
  INTERNAL_ERROR_CODE,
  GENERIC_INTERNAL_MESSAGE,
};
