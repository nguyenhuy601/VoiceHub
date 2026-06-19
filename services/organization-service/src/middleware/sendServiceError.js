const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');

const { sendServiceError, sendErrorFromCatch } = createServiceErrorHelper('ORG_INTERNAL_ERROR', {
  legacyCodeField: true,
});

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'ORG_INTERNAL_ERROR',
};
