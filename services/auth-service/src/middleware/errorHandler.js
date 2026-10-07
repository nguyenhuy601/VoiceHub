const { buildApiErrorBody } = require('@enterprise/shared/middleware/httpErrorResponse');
const { toAuthError } = require('../utils/authErrorMap');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) {
    return;
  }

  if (err?.message && (err.message.includes('aborted') || err.message.includes('ECONNRESET'))) {
    console.log('Request aborted or connection reset');
    return;
  }

  const safe = toAuthError(err, 500);
  const logLine = `[auth-service] ${req.method} ${req.originalUrl?.split('?')[0] || req.path} -> ${safe.statusCode} ${safe.errorCode}`;
  if (safe.statusCode >= 500) {
    console.error(logLine, err?.message || err);
  } else {
    console.warn(logLine);
  }

  const body = buildApiErrorBody(safe.statusCode, {
    errorCode: safe.errorCode,
    messageUser: safe.messageUser,
    message: safe.statusCode >= 500 ? undefined : safe.message,
  });

  res.status(safe.statusCode).json(body);
};
