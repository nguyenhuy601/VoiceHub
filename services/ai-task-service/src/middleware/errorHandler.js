const { sanitizeCaughtError } = require('../utils/aiTaskErrorSanitize');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) return;

  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return res.status(400).json({
      success: false,
      message: 'Nội dung JSON không hợp lệ',
      errorCode: 'AI_BAD_JSON',
      messageUser: 'Nội dung JSON không hợp lệ',
    });
  }

  const classified = sanitizeCaughtError(err, {
    fallbackCode: 'AI_INTERNAL_ERROR',
    fallbackStatus: 500,
  });

  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      errorCode: classified.errorCode,
      status: classified.status,
      errName: err?.name || 'Error',
      route: `${req.method} ${req.originalUrl || req.url || ''}`,
    })
  );

  return res.status(classified.status).json({
    success: false,
    message: classified.message,
    errorCode: classified.errorCode,
    messageUser: classified.message,
  });
};
