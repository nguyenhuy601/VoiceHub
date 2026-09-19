const { applyRemoteHowJobResult } = require('../services/aiAnalysis.service');

async function applyJobResult(req, res) {
  try {
    const data = await applyRemoteHowJobResult(req.body || {});
    if (data?.retryable && data?.reason === 'conditional_update_missed') {
      return res.status(409).json({
        success: false,
        message: 'Concurrent requirement-pack update; retry callback delivery',
        errorCode: 'REMOTE_RESULT_CAS_RETRY',
        data,
      });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || 'Failed to apply remote planning result',
      errorCode: error.errorCode || error.code || 'REMOTE_RESULT_APPLY_FAILED',
    });
  }
}

module.exports = { applyJobResult };
