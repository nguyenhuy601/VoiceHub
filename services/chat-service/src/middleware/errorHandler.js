const { buildApiErrorBody, GENERIC_5XX_MESSAGE } = require('@enterprise/shared/middleware/httpErrorResponse');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) {
    return;
  }

  console.error('Error:', err);
  const statusCode = Number(err?.statusCode) || 500;
  const isServerError = statusCode >= 500;
  const errorCode = String(
    err?.errorCode || err?.code || (isServerError ? 'CHAT_INTERNAL_ERROR' : '')
  ).trim();
  const clientMessage = String(err?.messageUser || err?.message || 'Yêu cầu không hợp lệ').trim();

  const body = buildApiErrorBody(statusCode, {
    errorCode: errorCode || undefined,
    messageUser: isServerError ? GENERIC_5XX_MESSAGE : clientMessage,
    message: isServerError ? undefined : clientMessage,
  });

  res.status(statusCode).json(body);
};
