const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper('VOICE_INTERNAL_ERROR');

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'VOICE_INTERNAL_ERROR',
};
