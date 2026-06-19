const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper('CHAT_INTERNAL_ERROR');

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'CHAT_INTERNAL_ERROR',
};
