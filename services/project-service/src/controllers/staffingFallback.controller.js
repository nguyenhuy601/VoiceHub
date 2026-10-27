const {
  suggestReplaceCandidates,
  applyPmOverrideReassign,
  markFailedShortHorizon,
} = require('../services/staffingFallback.service');

function actorId(req) {
  return req.user?._id || req.user?.id || req.headers['x-user-id'];
}

async function suggestReplace(req, res) {
  try {
    const data = await suggestReplaceCandidates({
      taskId: req.params.taskId,
      actorUserId: actorId(req),
      limit: req.query.limit,
    });
    return res.json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'suggest replace failed',
      errorCode: err.errorCode,
    });
  }
}

async function pmOverride(req, res) {
  try {
    const data = await applyPmOverrideReassign({
      taskId: req.params.taskId,
      actorUserId: actorId(req),
      toUserId: req.body?.toUserId || req.body?.userId,
      reason: req.body?.reason,
      requestId: req.headers['x-request-id'] || '',
    });
    return res.json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'PM override failed',
      errorCode: err.errorCode,
    });
  }
}

async function failShortHorizon(req, res) {
  try {
    const data = await markFailedShortHorizon({
      taskId: req.params.taskId,
      actorUserId: actorId(req),
      reason: req.body?.reason,
      requestId: req.headers['x-request-id'] || '',
    });
    return res.json({ success: true, data });
  } catch (err) {
    const status = err.statusCode || 500;
    return res.status(status).json({
      success: false,
      message: err.message || 'fail short-horizon failed',
      errorCode: err.errorCode,
    });
  }
}

module.exports = {
  suggestReplace,
  pmOverride,
  failShortHorizon,
};
