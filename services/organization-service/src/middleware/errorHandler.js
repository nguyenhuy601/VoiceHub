const { buildApiErrorBody } = require('@enterprise/shared/middleware/httpErrorResponse');
const { logger } = require('@enterprise/shared');
const { toOrgError } = require('../utils/orgErrorMap');

module.exports = (err, req, res, next) => {
  if (req.aborted || res.headersSent) {
    return;
  }

  const mapped = toOrgError(err, Number(err?.statusCode) || 500);
  const logPayload = {
    errorCode: mapped.errorCode,
    statusCode: mapped.statusCode,
    name: String(err?.name || ''),
    code: err?.code != null ? String(err.code) : undefined,
    method: req.method,
    path: req.originalUrl ? String(req.originalUrl).split('?')[0] : undefined,
    orgId: req.params?.orgId || undefined,
  };
  if (mapped.statusCode >= 500) {
    logger.error('[organization-service] request failed', logPayload);
  } else {
    logger.warn('[organization-service] request rejected', logPayload);
  }

  const body = buildApiErrorBody(mapped.statusCode, {
    errorCode: mapped.errorCode,
    messageUser: mapped.messageUser,
    message: mapped.statusCode >= 500 ? undefined : mapped.message,
    extra: { code: mapped.errorCode },
  });

  res.status(mapped.statusCode).json(body);
};
