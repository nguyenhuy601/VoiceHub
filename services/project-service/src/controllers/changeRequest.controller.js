const mongoose = require('../db');
const changeRequestService = require('../services/changeRequest.service');
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
    const data = await changeRequestService.listChangeRequests({
      userId,
      projectId,
      type: req.query?.type,
      status: req.query?.status,
      priority: req.query?.priority,
      q: req.query?.q,
      sort: req.query?.sort,
      page: req.query?.page,
      size: req.query?.size,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải change requests',
      'CHANGE_REQUEST_LIST_FAILED'
    );
  }
}

async function getItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, crId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(crId)) {
      return res.status(400).json({ success: false, message: 'projectId/crId không hợp lệ' });
    }
    const data = await changeRequestService.getChangeRequest({ userId, projectId, crId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tải change request',
      'CHANGE_REQUEST_GET_FAILED'
    );
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
    const data = await changeRequestService.createChangeRequest({
      userId,
      projectId,
      title: req.body?.title,
      description: req.body?.description,
      type: req.body?.type,
      priority: req.body?.priority,
      reason: req.body?.reason,
      current: req.body?.current,
      requestedChange: req.body?.requestedChange,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể tạo change request',
      'CHANGE_REQUEST_CREATE_FAILED'
    );
  }
}

async function patchItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, crId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(crId)) {
      return res.status(400).json({ success: false, message: 'projectId/crId không hợp lệ' });
    }
    const data = await changeRequestService.patchChangeRequest({
      userId,
      projectId,
      crId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể cập nhật change request',
      'CHANGE_REQUEST_PATCH_FAILED'
    );
  }
}

async function deleteItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, crId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(crId)) {
      return res.status(400).json({ success: false, message: 'projectId/crId không hợp lệ' });
    }
    const data = await changeRequestService.deleteChangeRequest({ userId, projectId, crId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể xóa change request',
      'CHANGE_REQUEST_DELETE_FAILED'
    );
  }
}

async function submitApproval(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, crId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(crId)) {
      return res.status(400).json({ success: false, message: 'projectId/crId không hợp lệ' });
    }
    const data = await changeRequestService.submitChangeRequestApproval({
      userId,
      projectId,
      crId,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể gửi duyệt change request',
      'CHANGE_REQUEST_SUBMIT_APPROVAL_FAILED'
    );
  }
}

module.exports = {
  listItems,
  getItem,
  createItem,
  patchItem,
  deleteItem,
  submitApproval,
};
