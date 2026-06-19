const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper('TASK_INTERNAL_ERROR');

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'TASK_INTERNAL_ERROR',
};
