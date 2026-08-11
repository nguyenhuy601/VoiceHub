const mongoose = require('../db');
const {
  listTaskHistory,
  listPlanningItemHistory,
} = require('../services/workHistory.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

async function listTask(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const taskId = String(req.params.taskId || '').trim();
    if (!mongoose.isValidObjectId(taskId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'taskId không hợp lệ',
        message: 'Invalid taskId',
      });
    }
    const data = await listTaskHistory({
      taskId,
      actorUserId: userId,
      limit: req.query?.limit,
      before: req.query?.before,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải lịch sử work',
      'WORK_HISTORY_LIST_FAILED'
    );
  }
}

async function listPlanningItem(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const projectId = String(req.params.projectId || '').trim();
    const itemId = String(req.params.itemId || '').trim();
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(itemId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_REQUIRED',
        messageUser: 'projectId/itemId không hợp lệ',
        message: 'Invalid projectId/itemId',
      });
    }
    const data = await listPlanningItemHistory({
      projectId,
      itemId,
      actorUserId: userId,
      limit: req.query?.limit,
      before: req.query?.before,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải lịch sử planning',
      'PLANNING_HISTORY_LIST_FAILED'
    );
  }
}

module.exports = {
  listTask,
  listPlanningItem,
};
