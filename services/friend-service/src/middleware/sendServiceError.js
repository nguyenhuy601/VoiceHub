const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper('FRIEND_INTERNAL_ERROR');

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'FRIEND_INTERNAL_ERROR',
};
