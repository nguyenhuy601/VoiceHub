const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function orgFail(res, statusCode, message, errorCode) {
  const msg = String(message || 'Yêu cầu không hợp lệ.').trim();
  return sendServiceError(res, statusCode, {
    errorCode,
    messageUser: msg,
    message: msg,
  });
}

function orgUnauthorized(res, message = 'Vui lòng đăng nhập lại.') {
  return orgFail(res, 401, message, 'AUTH_NO_TOKEN');
}

function orgAccessDenied(res, message = 'Bạn không có quyền truy cập tổ chức này.') {
  return orgFail(res, 403, message, 'ORG_ACCESS_DENIED');
}

function orgNotFound(res, message = 'Không tìm thấy tổ chức.') {
  return orgFail(res, 404, message, 'ORG_NOT_FOUND');
}

function orgMemberNotFound(res, message = 'Không tìm thấy thành viên.') {
  return orgFail(res, 404, message, 'ORG_MEMBER_NOT_FOUND');
}

function orgValidation(res, message, errorCode = 'VALIDATION_REQUIRED') {
  return orgFail(res, 400, message, errorCode);
}

function orgConflict(res, message, errorCode = 'ORG_ALREADY_MEMBER') {
  return orgFail(res, 409, message, errorCode);
}

function orgCatch(res, err, fallbackStatus = 500, fallbackMessage = 'Hệ thống tạm thời gặp sự cố.', fallbackCode = 'ORG_INTERNAL_ERROR') {
  return sendErrorFromCatch(res, err, fallbackStatus, fallbackMessage, fallbackCode);
}

function orgOperationalError(res, error) {
  const status = Number(error?.statusCode);
  if (!status) return null;
  const msg = String(error?.messageUser || error?.message || 'Yêu cầu không hợp lệ.').trim();
  const code = String(error?.errorCode || error?.code || '').trim();
  return sendServiceError(res, status, {
    errorCode: code || undefined,
    messageUser: msg,
    message: msg,
  });
}

module.exports = {
  orgFail,
  orgUnauthorized,
  orgAccessDenied,
  orgNotFound,
  orgMemberNotFound,
  orgValidation,
  orgConflict,
  orgCatch,
  orgOperationalError,
  sendServiceError,
  sendErrorFromCatch,
};
