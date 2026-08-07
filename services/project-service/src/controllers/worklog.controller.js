const mongoose = require('../db');
const {
  createWorklog,
  listWorklogsForTask,
  getSprintTimeSummary,
} = require('../services/worklog.service');
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

async function listTaskWorklogs(req, res) {
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
    const data = await listWorklogsForTask({ taskId, actorUserId: userId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải worklog',
      'WORKLOG_LIST_FAILED'
    );
  }
}

async function createTaskWorklog(req, res) {
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
    const body = req.body || {};
    const data = await createWorklog({
      taskId,
      actorUserId: userId,
      userId: body.userId,
      workDate: body.workDate,
      hours: body.hours,
      note: body.note,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tạo worklog',
      'WORKLOG_CREATE_FAILED'
    );
  }
}

async function getSprintTimeSummaryController(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    const projectId = String(req.params.projectId || '').trim();
    const sprintId = String(req.params.sprintId || '').trim();
    const data = await getSprintTimeSummary({
      projectId,
      sprintId,
      actorUserId: userId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải sprint time summary',
      'SPRINT_TIME_SUMMARY_FAILED'
    );
  }
}

module.exports = {
  listTaskWorklogs,
  createTaskWorklog,
  getSprintTimeSummaryController,
};
