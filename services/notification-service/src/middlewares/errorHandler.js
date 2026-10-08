const logger = require('@enterprise/shared/utils/logger');
const { sendServiceError, INTERNAL_ERROR_CODE } = require('./sendServiceError');

const INVALID_JSON_MESSAGE = 'Dữ liệu gửi lên không đúng định dạng JSON';
const PAYLOAD_TOO_LARGE_MESSAGE = 'Dữ liệu gửi lên vượt quá dung lượng cho phép';
const ROUTE_NOT_FOUND_MESSAGE = 'Không tìm thấy tài nguyên yêu cầu';

function resolveClientError(err) {
  if (err?.type === 'entity.too.large') {
    return { status: 413, errorCode: 'NOTIFICATION_PAYLOAD_TOO_LARGE', message: PAYLOAD_TOO_LARGE_MESSAGE };
  }
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return { status: 400, errorCode: 'NOTIFICATION_INVALID_JSON', message: INVALID_JSON_MESSAGE };
  }
  const status = Number(err?.statusCode || err?.status);
  if (status >= 400 && status < 500) {
    return { status, errorCode: err?.errorCode, message: err?.messageUser || err?.message };
  }
  return null;
}

function notFoundHandler(req, res) {
  return sendServiceError(res, 404, {
    errorCode: 'NOTIFICATION_ROUTE_NOT_FOUND',
    message: ROUTE_NOT_FOUND_MESSAGE,
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const clientError = resolveClientError(err);
  if (clientError) {
    logger.warn(`[notification] ${req.method} ${req.originalUrl} ${clientError.status}: ${err?.message}`);
    return sendServiceError(res, clientError.status, {
      errorCode: clientError.errorCode,
      message: clientError.message,
    });
  }
  logger.error(`[notification] ${req.method} ${req.originalUrl} unhandled error: ${err?.message}`);
  return sendServiceError(res, 500, { errorCode: INTERNAL_ERROR_CODE });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
