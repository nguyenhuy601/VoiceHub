const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');
const { toOrgError, GENERIC_INTERNAL_MESSAGE } = require('./orgErrorMap');

function orgFail(res, statusCode, message, errorCode) {
  const isServerError = Number(statusCode) >= 500;
  const msg = isServerError
    ? GENERIC_INTERNAL_MESSAGE
    : String(message || 'Yêu cầu không hợp lệ.').trim();
  return sendServiceError(res, statusCode, {
    errorCode,
    messageUser: msg,
    message: msg,
  });
}

function orgUnauthorized(res, message = 'Vui lòng đăng nhập lại.') {
  return orgFail(res, 401, message, 'AUTH_NO_TOKEN');
}

function orgAccessDenied(res, message = 'Bạn không có quyền truy cập tổ chức này.', errorCode = 'ORG_ACCESS_DENIED') {
  return orgFail(res, 403, message, errorCode);
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
  const mapped = toOrgError(err, fallbackStatus, fallbackMessage, fallbackCode);
  return sendServiceError(res, mapped.statusCode, {
    errorCode: mapped.errorCode,
    messageUser: mapped.messageUser,
    message: mapped.statusCode >= 500 ? undefined : mapped.message,
  });
}

function orgOperationalError(res, error) {
  const status = Number(error?.statusCode);
  if (!status) return null;
  return orgCatch(res, error, status);
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
