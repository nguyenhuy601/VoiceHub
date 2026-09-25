const mongoose = require('../db');
const taskQaService = require('../services/taskQa.service');
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

function invalidId(res) {
  return sendServiceError(res, 400, {
    errorCode: 'VALIDATION_INVALID_ID',
    messageUser: 'projectId/taskId không hợp lệ',
    message: 'Invalid projectId/taskId',
  });
}

async function proposeFixSuggestion(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, taskId } = req.params;
    if (!userId) return unauthorized(res);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(taskId)) {
      return invalidId(res);
    }
    const data = await taskQaService.proposeFixSuggestion({
      userId,
      projectId,
      taskId,
      text: req.body?.text,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể đề xuất bản sửa',
      'TASK_FIX_SUGGESTION_FAILED'
    );
  }
}

async function decideFixSuggestion(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, taskId } = req.params;
    if (!userId) return unauthorized(res);
    if (!mongoose.isValidObjectId(projectId) || !mongoose.isValidObjectId(taskId)) {
      return invalidId(res);
    }
    const data = await taskQaService.decideTaskFixSuggestion({
      userId,
      projectId,
      taskId,
      decision: req.body?.decision,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể quyết định bản sửa',
      'TASK_FIX_SUGGESTION_DECIDE_FAILED'
    );
  }
}

module.exports = {
  proposeFixSuggestion,
  decideFixSuggestion,
};
