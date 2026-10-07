const { assertRbacWriteAllowed, ROLE_RATE_LIMITED, LIMIT_MESSAGE } = require('../utils/rbacWriteLimit');
const { sendServiceError } = require('./sendServiceError');

/** Sau requireOrgRoleManager. 429 trả thẳng, không next(err), để errorHandler không log cả object. */
async function rbacWriteLimit(req, res, next) {
  try {
    await assertRbacWriteAllowed({ req });
    return next();
  } catch (err) {
    if (err?.statusCode === 429) {
      return sendServiceError(res, 429, {
        errorCode: err.errorCode || ROLE_RATE_LIMITED,
        messageUser: err.messageUser || LIMIT_MESSAGE,
        message: err.messageUser || LIMIT_MESSAGE,
      });
    }
    return next(err);
  }
}

module.exports = rbacWriteLimit;
