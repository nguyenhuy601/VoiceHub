/**
 * Map unknown/role/verify errors to safe client message + errorCode.
 * Never forward raw Error.message (may contain host, CastError, stack fragments).
 */

const SAFE_BY_CODE = {
  AI_EXTRACT_FORBIDDEN: 'Bạn không có quyền trích xuất từ tin nhắn này',
  AI_CONFIRM_ROLE_DENIED: 'Bạn không có quyền xác nhận task AI',
  AI_PROJECT_ROLE_DENIED: 'Chỉ PM/TL/Admin mới được tạo dự án bằng AI',
  AI_UPSTREAM_UNAVAILABLE: 'Dịch vụ phụ trợ tạm thời không khả dụng',
  AI_INTERNAL_ERROR: 'Đã xảy ra lỗi hệ thống',
  VALIDATION_INVALID_ID: 'Định danh không hợp lệ',
  AI_BAD_JSON: 'Nội dung JSON không hợp lệ',
};

/**
 * @param {unknown} err
 * @param {{ fallbackCode?: string, fallbackStatus?: number, fallbackMessage?: string }} [opts]
 */
function sanitizeCaughtError(err, opts = {}) {
  const fallbackCode = opts.fallbackCode || 'AI_INTERNAL_ERROR';
  const fallbackStatus = Number(opts.fallbackStatus) || 500;
  const fallbackMessage = opts.fallbackMessage || SAFE_BY_CODE[fallbackCode] || SAFE_BY_CODE.AI_INTERNAL_ERROR;

  // Network / axios — before fallbackCode safeKnown (fallback is often AI_INTERNAL_ERROR).
  if (err?.code === 'ECONNREFUSED' || err?.code === 'ETIMEDOUT' || err?.code === 'ENOTFOUND') {
    return {
      status: 503,
      errorCode: 'AI_UPSTREAM_UNAVAILABLE',
      message: SAFE_BY_CODE.AI_UPSTREAM_UNAVAILABLE,
    };
  }

  if (err?.name === 'CastError' || err?.name === 'BSONError') {
    return {
      status: 400,
      errorCode: 'VALIDATION_INVALID_ID',
      message: SAFE_BY_CODE.VALIDATION_INVALID_ID,
    };
  }

  const statusCode = Number(err?.statusCode) || fallbackStatus;
  const explicitCode = err?.errorCode != null && err?.errorCode !== '' ? String(err.errorCode) : '';

  // Business errors thrown with errorCode + safe messageUser
  if (err?.messageUser && typeof err.messageUser === 'string') {
    return {
      status: statusCode >= 400 && statusCode < 600 ? statusCode : fallbackStatus,
      errorCode: explicitCode || fallbackCode,
      message: String(err.messageUser),
    };
  }

  if (explicitCode && SAFE_BY_CODE[explicitCode]) {
    return {
      status: statusCode >= 400 && statusCode < 600 ? statusCode : fallbackStatus,
      errorCode: explicitCode,
      message: SAFE_BY_CODE[explicitCode],
    };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return {
      status: statusCode,
      errorCode: explicitCode || fallbackCode,
      message: fallbackMessage,
    };
  }

  return {
    status: 500,
    errorCode: 'AI_INTERNAL_ERROR',
    message: SAFE_BY_CODE.AI_INTERNAL_ERROR,
  };
}

/**
 * Never echo upstream axios/project-service message strings to clients.
 * @param {unknown} upstreamMessage
 * @param {string} fallback
 */
function sanitizeUpstreamMessage(upstreamMessage, fallback) {
  if (typeof upstreamMessage !== 'string' || !upstreamMessage.trim()) return fallback;
  const msg = upstreamMessage.trim();
  if (/ECONNREFUSED|E11000|Cast to ObjectId|at\s+\S+\.js:\d+|mongodb(\+srv)?:\/\//i.test(msg)) {
    return fallback;
  }
  return msg.slice(0, 200);
}

module.exports = {
  SAFE_BY_CODE,
  sanitizeCaughtError,
  sanitizeUpstreamMessage,
};
