const mongoose = require('../db');
const releaseReadyService = require('../services/releaseReady.service');
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
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) return invalidId(res);
    const data = await releaseReadyService.getReleaseReady({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể đánh giá Release Ready',
      'RELEASE_READY_GET_FAILED'
    );
  }
}

async function confirmItem(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) return invalidId(res);
    const data = await releaseReadyService.confirmReleaseReady({ userId, projectId });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể xác nhận Release Ready',
      err.errorCode || 'RELEASE_READY_CONFIRM_FAILED'
    );
  }
}

async function signOffUat(req, res) {
  try {
    const userId = asUserId(req);
    const { projectId } = req.params;
    if (!userId) return unauthorized(res);
    if (!validOid(projectId)) return invalidId(res);
    const data = await releaseReadyService.signOffUat({
      userId,
      projectId,
      result: req.body?.result,
      note: req.body?.note,
    });
    return res.json({ success: true, data });
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 400,
      'Không thể ký UAT',
      err.errorCode || 'UAT_SIGN_OFF_FAILED'
    );
  }
}

module.exports = {
  getItem,
  confirmItem,
  signOffUat,
};
