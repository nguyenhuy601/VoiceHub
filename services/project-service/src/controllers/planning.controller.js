const mongoose = require('../db');
const planningService = require('../services/planning.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function validOid(id) {
  return mongoose.isValidObjectId(String(id || ''));
}

function unauthorized(res) {
  return sendServiceError(res, 401, {
    errorCode: 'AUTH_NO_TOKEN',
    messageUser: 'Vui lòng đăng nhập lại.',
    message: 'Unauthorized',
  });
}

async function listItems(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await planningService.listPlanningItems({
      userId,
      projectId,
      type: req.query?.type,
      parentId: req.query?.parentId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải planning items', 'PLANNING_LIST_FAILED');
  }
}

async function createItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await planningService.createPlanningItem({
      userId,
      projectId,
      ...(req.body || {}),
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tạo planning item', 'PLANNING_CREATE_FAILED');
  }
}

async function patchItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, itemId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(itemId)) {
      return res.status(400).json({ success: false, message: 'projectId/itemId không hợp lệ' });
    }
    const data = await planningService.patchPlanningItem({
      userId,
      projectId,
      itemId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể cập nhật planning item', 'PLANNING_PATCH_FAILED');
  }
}

async function deleteItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, itemId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(itemId)) {
      return res.status(400).json({ success: false, message: 'projectId/itemId không hợp lệ' });
    }
    const data = await planningService.deletePlanningItem({ userId, projectId, itemId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể xóa planning item', 'PLANNING_DELETE_FAILED');
  }
}

async function listBacklog(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) {
      return res.status(400).json({ success: false, message: 'projectId không hợp lệ' });
    }
    const data = await planningService.listBacklog({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải backlog', 'BACKLOG_LIST_FAILED');
  }
}

async function linkTaskEpic(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, taskId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(taskId)) {
      return res.status(400).json({ success: false, message: 'projectId/taskId không hợp lệ' });
    }
    const data = await planningService.linkTaskToEpic({
      userId,
      projectId,
      taskId,
      epicId: req.body?.epicId,
      issueType: req.body?.issueType,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể gắn epic', 'TASK_EPIC_LINK_FAILED');
  }
}

module.exports = {
  listItems,
  createItem,
  patchItem,
  deleteItem,
  listBacklog,
  linkTaskEpic,
};
