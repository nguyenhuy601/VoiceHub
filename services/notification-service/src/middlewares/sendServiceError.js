const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const INTERNAL_ERROR_CODE = 'NOTIFICATION_INTERNAL_ERROR';

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper(INTERNAL_ERROR_CODE);

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE,
};
