const { buildApiErrorBody, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) {
    return;
  }

  if (err?.message && (err.message.includes('aborted') || err.message.includes('ECONNRESET'))) {
    console.log('Request aborted or connection reset');
    return;
  }

  const statusCode = Number(err?.statusCode) || 500;
  const isServerError = statusCode >= 500;
  const errorCode = String(
    err?.errorCode || err?.code || (isServerError ? 'AUTH_INTERNAL_ERROR' : '')
  ).trim();

  if (isServerError) {
    console.error('ERROR', err);
  }

  const clientMessage = String(err?.messageUser || err?.message || '').trim();
  const body = buildApiErrorBody(statusCode, {
    errorCode: errorCode || undefined,
    messageUser: isServerError ? GENERIC_5XX_MESSAGE : clientMessage,
    message: isServerError ? undefined : clientMessage,
    extra: process.env.NODE_ENV === 'development' && err?.stack
      ? { stack: err.stack }
      : undefined,
  });

  res.status(statusCode).json(body);
};
