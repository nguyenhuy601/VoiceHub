const { applyRemoteHowJobResult } = require('../services/aiAnalysis.service');
const { sendErrorFromCatch } = require('../middleware/sendServiceError');
const {
  hydrateAnalysisSnapshotForPlanning,
} = require('../services/aiPlanningSnapshotHydrate.service');

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
    return sendErrorFromCatch(
      res,
      error,
      error.statusCode || 500,
      'Không thể áp dụng kết quả planning',
      error.errorCode || error.code || 'REMOTE_RESULT_APPLY_FAILED'
    );
  }
}

/**
 * GET /internal/ai-planning/snapshots/:snapshotId?packId=&organizationId=
 */
async function hydrateSnapshot(req, res) {
  try {
    const data = await hydrateAnalysisSnapshotForPlanning({
      snapshotId: req.params.snapshotId,
      packId: req.query.packId || req.body?.packId,
      organizationId:
        req.query.organizationId ||
        req.body?.organizationId ||
        req.headers['x-organization-id'],
    });
    return res.json({ success: true, data });
  } catch (error) {
    return sendErrorFromCatch(
      res,
      error,
      error.statusCode || 500,
      'Không thể tải snapshot phân tích',
      error.errorCode || error.code || 'SNAPSHOT_HYDRATE_FAILED'
    );
  }
}

module.exports = { applyJobResult, hydrateSnapshot };
