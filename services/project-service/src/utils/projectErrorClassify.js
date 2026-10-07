const { GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

const SAFE_ERROR_CODE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNABORTED',
]);

const MSG = Object.freeze({
  INVALID_ID: 'Mã định danh không hợp lệ.',
  VALIDATION: 'Dữ liệu không hợp lệ.',
  DUPLICATE: 'Dữ liệu đã tồn tại.',
  UPSTREAM: 'Dịch vụ liên quan tạm thời không khả dụng. Vui lòng thử lại sau.',
  BAD_JSON: 'Dữ liệu gửi lên không đúng định dạng JSON.',
  PAYLOAD_TOO_LARGE: 'Dữ liệu gửi lên quá lớn.',
  UPLOAD_TOO_LARGE: 'Tệp tải lên vượt quá dung lượng cho phép.',
  UPLOAD_INVALID: 'Tệp tải lên không hợp lệ.',
  CORS: 'Nguồn gốc yêu cầu không được phép.',
  WORKSPACE: 'Không thể xác thực workspace. Vui lòng thử lại sau.',
  FEATURE: 'Tính năng tạm thời không khả dụng.',
});

/**
 * @param {unknown} code
 * @returns {string|undefined}
 */
function sanitizeErrorCode(code) {
  const raw = String(code || '').trim();
  if (!raw) return undefined;
  if (raw.startsWith('ERR_')) return undefined;
  if (NETWORK_CODES.has(raw)) return undefined;
  if (/^\d+$/.test(raw)) return undefined;
  if (raw === 'LIMIT_FILE_SIZE' || raw.startsWith('LIMIT_')) return undefined;
  if (!SAFE_ERROR_CODE_RE.test(raw)) return undefined;
  return raw;
}

function isAxiosLike(err) {
  return Boolean(err?.isAxiosError) || Boolean(err?.config && err?.response !== undefined && err?.request);
}

function isMongoDuplicate(err) {
  return err?.code === 11000 || err?.code === '11000' || /E11000/i.test(String(err?.message || ''));
}

function isCastOrBson(err) {
  const name = String(err?.name || '');
  return (
    name === 'CastError' ||
    name === 'BSONError' ||
    name === 'BSONTypeError' ||
    name === 'BSONObjectIdError'
  );
}

/**
 * Classify an error for client-safe response.
 * @param {unknown} err
 * @param {number} [fallbackStatus=400]
 * @returns {{ status: number, errorCode: string, messageUser: string, isInternal: boolean, logName: string }}
 */
function classifyProjectError(err, fallbackStatus = 400) {
  const e = err && typeof err === 'object' ? err : {};
  const name = String(e.name || (e instanceof Error ? e.constructor?.name : '') || 'Error');
  const code = e.code;
  const type = String(e.type || '');
  const fallback = Number(fallbackStatus) || 400;

  // Express body-parser / raw-body
  if (type === 'entity.too.large' || code === 'entity.too.large') {
    return {
      status: 413,
      errorCode: 'PROJECT_PAYLOAD_TOO_LARGE',
      messageUser: MSG.PAYLOAD_TOO_LARGE,
      isInternal: false,
      logName: name,
    };
  }
  if (type === 'entity.parse.failed' || (e instanceof SyntaxError && ('body' in e || type.includes('entity')))) {
    return {
      status: 400,
      errorCode: 'PROJECT_BAD_JSON',
      messageUser: MSG.BAD_JSON,
      isInternal: false,
      logName: name,
    };
  }

  if (name === 'MulterError') {
    if (code === 'LIMIT_FILE_SIZE') {
      return {
        status: 413,
        errorCode: 'PROJECT_UPLOAD_TOO_LARGE',
        messageUser: MSG.UPLOAD_TOO_LARGE,
        isInternal: false,
        logName: name,
      };
    }
    return {
      status: 400,
      errorCode: 'PROJECT_UPLOAD_INVALID',
      messageUser: MSG.UPLOAD_INVALID,
      isInternal: false,
      logName: name,
    };
  }

  if (String(e.message || '') === 'CORS blocked' || e.errorCode === 'CORS_FORBIDDEN') {
    return {
      status: 403,
      errorCode: 'CORS_FORBIDDEN',
      messageUser: MSG.CORS,
      isInternal: false,
      logName: name,
    };
  }

  if (isCastOrBson(e)) {
    return {
      status: 400,
      errorCode: 'VALIDATION_INVALID_ID',
      messageUser: MSG.INVALID_ID,
      isInternal: false,
      logName: name,
    };
  }

  if (name === 'ValidationError' && e.errors) {
    return {
      status: 400,
      errorCode: sanitizeErrorCode(e.errorCode) || 'VALIDATION_FAILED',
      messageUser: e.messageUser || MSG.VALIDATION,
      isInternal: false,
      logName: name,
    };
  }

  if (isMongoDuplicate(e)) {
    return {
      status: 409,
      errorCode: 'DUPLICATE_RESOURCE',
      messageUser: MSG.DUPLICATE,
      isInternal: false,
      logName: name,
    };
  }

  if (isAxiosLike(e) || NETWORK_CODES.has(String(code || ''))) {
    return {
      status: 503,
      errorCode: 'UPSTREAM_UNAVAILABLE',
      messageUser: MSG.UPSTREAM,
      isInternal: true,
      logName: name,
    };
  }

  if (
    name === 'MongoNetworkError' ||
    name === 'MongoServerSelectionError' ||
    name === 'MongoTimeoutError' ||
    (name.startsWith('Mongo') && !isMongoDuplicate(e) && name !== 'MongoServerError')
  ) {
    return {
      status: 500,
      errorCode: 'TASK_INTERNAL_ERROR',
      messageUser: GENERIC_5XX_MESSAGE,
      isInternal: true,
      logName: name,
    };
  }

  if (name === 'MongoServerError') {
    return {
      status: 500,
      errorCode: 'TASK_INTERNAL_ERROR',
      messageUser: GENERIC_5XX_MESSAGE,
      isInternal: true,
      logName: name,
    };
  }

  if (name === 'TypeError' || name === 'ReferenceError' || name === 'RangeError') {
    return {
      status: 500,
      errorCode: 'TASK_INTERNAL_ERROR',
      messageUser: GENERIC_5XX_MESSAGE,
      isInternal: true,
      logName: name,
    };
  }

  // Business Error: keep status + message when present
  const statusFromErr = Number(e.statusCode);
  const hasBusinessStatus = Number.isFinite(statusFromErr) && statusFromErr >= 400 && statusFromErr < 600;
  const status = hasBusinessStatus ? statusFromErr : fallback;
  const isServer = status >= 500;
  const safeCode =
    sanitizeErrorCode(e.errorCode) ||
    sanitizeErrorCode(typeof code === 'string' ? code : '') ||
    (isServer ? 'TASK_INTERNAL_ERROR' : 'TASK_REQUEST_FAILED');

  if (isServer) {
    return {
      status,
      errorCode: safeCode,
      messageUser: GENERIC_5XX_MESSAGE,
      isInternal: true,
      logName: name,
    };
  }

  const messageUser = String(e.messageUser || e.message || MSG.VALIDATION).trim() || MSG.VALIDATION;
  return {
    status,
    errorCode: safeCode,
    messageUser,
    isInternal: false,
    logName: name,
  };
}

module.exports = {
  classifyProjectError,
  sanitizeErrorCode,
  MSG,
};
