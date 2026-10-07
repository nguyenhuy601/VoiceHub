const {
  buildApiErrorBody,
  GENERIC_5XX_MESSAGE,
} = require('@enterprise/shared/middleware/httpErrorResponse');

module.exports = (err, req, res, next) => {
  const status = Number(err?.statusCode) || 500;
  console.error('Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  const is5xx = status >= 500;
  return res.status(status).json(
    buildApiErrorBody(status, {
      errorCode: err?.errorCode || (is5xx ? 'ROLE_INTERNAL_ERROR' : undefined),
      messageUser: is5xx ? GENERIC_5XX_MESSAGE : err?.messageUser || err?.message,
      message: is5xx ? undefined : err?.message,
    })
  );
};
