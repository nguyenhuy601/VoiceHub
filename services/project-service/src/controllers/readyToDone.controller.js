const mongoose = require('../db');
const readyToDoneService = require('../services/readyToDone.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(value) {
  return mongoose.isValidObjectId(String(value || ''));
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
    messageUser: 'ID không hợp lệ',
    message: 'Invalid id',
  });
}

async function getItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, taskId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(taskId)) return invalidId(res);
    const data = await readyToDoneService.getReadyToDone({ userId, projectId, taskId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể đánh giá sẵn sàng Done',
      'READY_TO_DONE_GET_FAILED'
    );
  }
}

async function listMap(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) return invalidId(res);
    const data = await readyToDoneService.listReadyToDoneMap({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải map sẵn sàng Done',
      'READY_TO_DONE_MAP_FAILED'
    );
  }
}

async function confirmItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, taskId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(taskId)) return invalidId(res);
    const data = await readyToDoneService.confirmReadyToDone({ userId, projectId, taskId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể xác nhận Done',
      err.errorCode || 'READY_TO_DONE_CONFIRM_FAILED'
    );
  }
}

module.exports = {
  getItem,
  listMap,
  confirmItem,
};
