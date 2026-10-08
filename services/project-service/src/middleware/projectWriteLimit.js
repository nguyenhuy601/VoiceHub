const {
  assertProjectWriteAllowed,
  shouldLimitProjectWrite,
  PROJECT_RATE_LIMITED,
  LIMIT_MESSAGE,
} = require('../utils/projectWriteLimit');
const { sendServiceError } = require('./sendServiceError');

/** Sau gatewayUserMiddleware. 429 trả thẳng, không next(err), để errorHandler không log cả object. */
async function projectWriteLimit(req, res, next) {
  if (!shouldLimitProjectWrite(req)) return next();
  try {
    await assertProjectWriteAllowed({ req });
    return next();
  } catch (err) {
    if (err?.statusCode === 429) {
      return sendServiceError(res, 429, {
        errorCode: err.errorCode || PROJECT_RATE_LIMITED,
        messageUser: err.messageUser || LIMIT_MESSAGE,
        message: err.messageUser || LIMIT_MESSAGE,
      });
    }
    return next(err);
  }
}

module.exports = projectWriteLimit;
