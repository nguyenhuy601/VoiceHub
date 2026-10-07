const { createServiceErrorHelper } = require('@enterprise/shared/middleware/httpErrorResponse');
const { classifyProjectError } = require('../utils/projectErrorClassify');

const helper = createServiceErrorHelper('TASK_INTERNAL_ERROR');
const { sendServiceError } = helper;

/**
 * Wrap shared sendErrorFromCatch with project-service classification
 * so system errors never leak as raw 4xx messages.
 */
function sendErrorFromCatch(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const classified = classifyProjectError(err, fallbackStatus);
  if (classified.isInternal || classified.status >= 500) {
    // eslint-disable-next-line no-console
    console.error(
      JSON.stringify({
        errorCode: classified.errorCode,
        errName: classified.logName,
        status: classified.status,
      })
    );
  }

  const safeErr = {
    statusCode: classified.status,
    errorCode: classified.errorCode || fallbackCode,
    messageUser: classified.messageUser,
    message: classified.isInternal || classified.status >= 500 ? undefined : classified.messageUser,
  };

  // Prefer classified message; for business errors keep fallbackMessage only if no message
  if (!classified.isInternal && classified.status < 500 && !safeErr.messageUser && fallbackMessage) {
    safeErr.messageUser = String(fallbackMessage);
    safeErr.message = String(fallbackMessage);
  }

  return helper.sendErrorFromCatch(
    res,
    safeErr,
    classified.status,
    classified.messageUser || fallbackMessage,
    classified.errorCode || fallbackCode
  );
}

module.exports = {
  sendServiceError,
  sendErrorFromCatch,
  INTERNAL_ERROR_CODE: 'TASK_INTERNAL_ERROR',
};
