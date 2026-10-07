const { sendServiceError } = require('./sendServiceError');

function requireUser(req, res, next) {
  const userId = req.user?.id || req.user?.userId;
  if (!userId) {
    return sendServiceError(res, 401, {
      errorCode: 'NOTIFICATION_UNAUTHORIZED',
      message: 'Unauthorized',
    });
  }
  return next();
}

module.exports = requireUser;
