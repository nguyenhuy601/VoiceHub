const GENERIC_5XX_MESSAGE = 'Hệ thống tạm thời gặp sự cố. Vui lòng thử lại sau.';

/**
 * Build JSON body lỗi API theo ERROR_CATALOG (sanitize 5xx, không lộ err.message).
 */
function buildApiErrorBody(statusCode, opts = {}) {
  const { errorCode, messageUser, message, extra } = opts;
  const is5xx = Number(statusCode) >= 500;
  const safeMessage = is5xx
    ? (messageUser || GENERIC_5XX_MESSAGE)
    : (message || messageUser || 'Request failed');
  const resolvedUser = messageUser || safeMessage;

  return {
    success: false,
    message: safeMessage,
    ...(errorCode ? { errorCode } : {}),
    messageUser: resolvedUser,
    ...(extra && typeof extra === 'object' ? extra : {}),
  };
}

function sendApiError(res, statusCode, opts = {}) {
  if (res.headersSent) return res;
  return res.status(statusCode).json(buildApiErrorBody(statusCode, opts));
}

/**
 * Factory tạo helper lỗi thống nhất theo ERROR_CATALOG cho từng microservice.
 */
function createServiceErrorHelper(defaultInternalErrorCode, opts = {}) {
  const legacyCodeField = opts.legacyCodeField === true;

  function resolveErrorCode(statusCode, errorCode, fallbackCode) {
    const is5xx = Number(statusCode) >= 500;
    const resolved = String(
      errorCode || fallbackCode || (is5xx ? defaultInternalErrorCode : '')
    ).trim();
    return resolved || undefined;
  }

  function sendServiceError(res, statusCode, bodyOpts = {}) {
    const { errorCode, message, messageUser, extra } = bodyOpts;
    const resolvedCode = resolveErrorCode(statusCode, errorCode, '');
    return sendApiError(res, statusCode, {
      errorCode: resolvedCode,
      message,
      messageUser,
      extra: legacyCodeField && resolvedCode
        ? { ...(extra || {}), code: resolvedCode }
        : extra,
    });
  }

  function sendErrorFromCatch(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
    const status = Number(err?.statusCode) || fallbackStatus;
    const isServerError = status >= 500;
    const resolvedCode = resolveErrorCode(
      status,
      err?.errorCode || err?.code,
      fallbackCode
    );
    const clientMessage = String(err?.messageUser || err?.message || fallbackMessage || '').trim();
    return sendApiError(res, status, {
      errorCode: resolvedCode,
      messageUser: isServerError ? GENERIC_5XX_MESSAGE : clientMessage,
      message: isServerError ? undefined : clientMessage,
      extra: legacyCodeField && resolvedCode ? { code: resolvedCode } : undefined,
    });
  }

  return {
    sendServiceError,
    sendErrorFromCatch,
    defaultInternalErrorCode,
  };
}

module.exports = {
  sendApiError,
  buildApiErrorBody,
  GENERIC_5XX_MESSAGE,
  createServiceErrorHelper,
};
