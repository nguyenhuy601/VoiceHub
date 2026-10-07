const { buildApiErrorBody } = require('@enterprise/shared/middleware/httpErrorResponse');
const { logger } = require('@enterprise/shared');
const { toUserError } = require('../utils/userErrorMap');

module.exports = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  const mapped = toUserError(err, Number(err?.statusCode) || 500);
  logger.error(
    `[user-service] ${req.method} ${req.path} -> ${mapped.statusCode} ${mapped.errorCode} (${
      String(err?.name || 'Error')
    }${err?.code ? `:${String(err.code).slice(0, 32)}` : ''})`
  );
  return res.status(mapped.statusCode).json(
    buildApiErrorBody(mapped.statusCode, {
      errorCode: mapped.errorCode,
      messageUser: mapped.messageUser,
      message: mapped.statusCode >= 500 ? undefined : mapped.message,
    })
  );
};
