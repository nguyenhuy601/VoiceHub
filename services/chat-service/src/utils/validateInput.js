const { mongoose } = require('@enterprise/shared/config/mongo');
const { sendServiceError } = require('../middleware/sendServiceError');

function requireObjectId(res, value, label, errorCode = 'VALIDATION_INVALID_ID') {
  const s = String(value || '').trim();
  if (!s || !mongoose.isValidObjectId(s)) {
    sendServiceError(res, 400, {
      errorCode,
      messageUser: `${label} không hợp lệ.`,
      message: `${label} is invalid`,
    });
    return null;
  }
  return s;
}

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

module.exports = {
  requireObjectId,
  requireParam,
  requireUserId,
};
