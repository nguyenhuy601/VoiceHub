const mongoose = require('../db');
const workPreviewService = require('../services/workPreview.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

async function getWorkPreview(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'Unauthorized',
      });
    }
    const { projectId } = req.params;
    if (!mongoose.isValidObjectId(String(projectId || ''))) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await workPreviewService.getWorkPreview({
      userId,
      projectId,
      kind: req.query?.kind,
      id: req.query?.id,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải preview',
      'WORK_PREVIEW_FAILED'
    );
  }
}

module.exports = { getWorkPreview };
