const { sendServiceError } = require('./sendServiceError');
const { classifyProjectError } = require('../utils/projectErrorClassify');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) {
    return;
  }

  const classified = classifyProjectError(err, Number(err?.statusCode) || 500);
  // eslint-disable-next-line no-console
  console.error(
    JSON.stringify({
      errorCode: classified.errorCode,
      errName: classified.logName,
      status: classified.status,
      route: `${req.method} ${req.originalUrl || req.url || ''}`,
    })
  );

  return sendServiceError(res, classified.status, {
    errorCode: classified.errorCode,
    messageUser: classified.messageUser,
    message: classified.status >= 500 ? undefined : classified.messageUser,
  });
};
