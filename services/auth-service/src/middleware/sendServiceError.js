const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');
const { toAuthError } = require('../utils/authErrorMap');

const helper = createServiceErrorHelper('AUTH_INTERNAL_ERROR');

function sendErrorFromCatch(res, err, fallbackStatus = 500, fallbackMessage, fallbackCode) {
  const safe = toAuthError(err, fallbackStatus);
  return helper.sendErrorFromCatch(res, safe, safe.statusCode, fallbackMessage, fallbackCode);
}

module.exports = {
  sendServiceError: helper.sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'AUTH_INTERNAL_ERROR',
};
