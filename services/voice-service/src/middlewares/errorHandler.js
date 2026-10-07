const logger = require('@enterprise/shared/utils/logger');
const { sendServiceError, INTERNAL_ERROR_CODE } = require('./sendServiceError');

const UPLOAD_TOO_LARGE_MESSAGE = 'Tệp ghi âm vượt quá dung lượng cho phép';
const UPLOAD_INVALID_MESSAGE = 'Tệp tải lên không hợp lệ';
const INVALID_JSON_MESSAGE = 'Dữ liệu gửi lên không đúng định dạng JSON';

function resolveClientError(err) {
  if (err?.name === 'MulterError') {
    return err.code === 'LIMIT_FILE_SIZE'
      ? { status: 413, errorCode: 'VOICE_UPLOAD_TOO_LARGE', message: UPLOAD_TOO_LARGE_MESSAGE }
      : { status: 400, errorCode: 'VOICE_UPLOAD_INVALID', message: UPLOAD_INVALID_MESSAGE };
  }
  if (err instanceof SyntaxError && (err.type === 'entity.parse.failed' || 'body' in err)) {
    return { status: 400, errorCode: 'VOICE_INVALID_JSON', message: INVALID_JSON_MESSAGE };
  }
  const status = Number(err?.statusCode || err?.status);
  if (status >= 400 && status < 500) {
    return { status, errorCode: err?.errorCode, message: err?.message };
  }
  return null;
}

module.exports = function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const clientError = resolveClientError(err);
  if (clientError) {
    logger.warn(`[voice] ${req.method} ${req.originalUrl} ${clientError.status}: ${err?.message}`);
    return sendServiceError(res, clientError.status, {
      errorCode: clientError.errorCode,
      message: clientError.message,
    });
  }
  logger.error(`[voice] ${req.method} ${req.originalUrl} unhandled error:`, err);
  const status = Number(err?.statusCode || err?.status);
  return sendServiceError(res, status >= 500 && status < 600 ? status : 500, {
    errorCode: INTERNAL_ERROR_CODE,
  });
};
