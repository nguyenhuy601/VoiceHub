const { SummaryError, resolveSummaryError, sendSummaryError } = require('../utils/summaryErrors');

function toSummaryError(err) {
  if (err instanceof SummaryError) return err;
  if (err?.name === 'CastError') return new SummaryError('SUMMARY_BAD_REQUEST', { cause: err });
  if (err?.type === 'entity.too.large') {
    return new SummaryError('SUMMARY_PAYLOAD_TOO_LARGE', { cause: err });
  }
  if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
    return new SummaryError('SUMMARY_BAD_REQUEST', { cause: err });
  }
  return new SummaryError('SUMMARY_INTERNAL', { cause: err });
}

function notFoundHandler(req, res) {
  return sendSummaryError(res, new SummaryError('SUMMARY_ROUTE_NOT_FOUND'));
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const summaryErr = toSummaryError(err);
  const { status, code } = resolveSummaryError(summaryErr);
  if (status >= 500) {
    console.error('[summary-service] request failed', {
      code,
      method: req.method,
      route: req.baseUrl + (req.route?.path || ''),
      userId: req.user?.id || null,
      cause: summaryErr.cause?.name || summaryErr.cause?.code || null,
    });
  }
  return sendSummaryError(res, summaryErr);
}

module.exports = { notFoundHandler, errorHandler, toSummaryError };
