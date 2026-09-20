const mongoose = require('../db');
const testCaseService = require('../services/testCase.service');
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

async function listItems(req, res) {
  try {
    const userId = asUserId(req);
    if (!userId) return unauthorized(res);
    if (!validOid(req.params.projectId)) return invalidId(res);
    const data = await testCaseService.listTestCases({
      userId,
      projectId: req.params.projectId,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải test cases', 'TEST_CASE_LIST_FAILED');
  }
}

async function getItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, testCaseId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(testCaseId)) return invalidId(res);
    const data = await testCaseService.getTestCase({ userId, projectId, testCaseId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tải test case', 'TEST_CASE_GET_FAILED');
  }
}

async function createItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) return invalidId(res);
    const data = await testCaseService.createTestCase({
      userId,
      projectId,
      title: req.body?.title,
      externalKey: req.body?.externalKey,
      status: req.body?.status,
      workItemId: req.body?.workItemId,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể tạo test case', 'TEST_CASE_CREATE_FAILED');
  }
}

async function patchItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, testCaseId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(testCaseId)) return invalidId(res);
    const data = await testCaseService.patchTestCase({
      userId,
      projectId,
      testCaseId,
      patch: req.body || {},
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể cập nhật test case', 'TEST_CASE_PATCH_FAILED');
  }
}

async function executeItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, testCaseId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(testCaseId)) return invalidId(res);
    const data = await testCaseService.executeTestCase({
      userId,
      projectId,
      testCaseId,
      result: req.body?.result,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể ghi nhận kết quả test', 'TEST_CASE_EXECUTE_FAILED');
  }
}

async function openBug(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId, testCaseId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId) || !validOid(testCaseId)) return invalidId(res);
    const data = await testCaseService.openBugFromTestCase({
      userId,
      projectId,
      testCaseId,
    });
    return res.status(201).json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, 'Không thể mở bug từ test case', 'TEST_CASE_OPEN_BUG_FAILED');
  }
}

module.exports = {
  listItems,
  getItem,
  createItem,
  patchItem,
  executeItem,
  openBug,
};
