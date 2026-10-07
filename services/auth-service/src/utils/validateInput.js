const { sendServiceError } = require('../middleware/sendServiceError');
const { isObjectIdString } = require('./authInputSafety');

function requireParam(res, value, label, errorCode = 'VALIDATION_REQUIRED') {
  const s = value == null ? '' : String(value).trim();
  if (!s) {
    sendServiceError(res, 400, {
      errorCode,
      messageUser: `${label} là bắt buộc.`,
      message: `${label} is required`,
    });
    return null;
  }
  return s;
}

function requireUserId(res, req) {
  const userId = String(req.user?.id || req.user?._id || req.user?.userId || '').trim();
  if (!userId) {
    sendServiceError(res, 401, {
      errorCode: 'AUTH_NO_TOKEN',
      messageUser: 'Vui lòng đăng nhập lại.',
      message: 'Unauthorized',
    });
    return null;
  }
  return userId;
}

function requireObjectId(res, value, field = 'userId') {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!isObjectIdString(s)) {
    sendServiceError(res, 400, {
      errorCode: 'AUTH_INVALID_ID',
      messageUser: 'Mã định danh không hợp lệ.',
      message: `${field} is invalid`,
    });
    return null;
  }
  return s;
}

module.exports = {
  requireParam,
  requireUserId,
  requireObjectId,
};
