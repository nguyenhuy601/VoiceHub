const INTERNAL_ERROR_CODE = 'NOTIFICATION_INTERNAL_ERROR';
const BULK_MAX_USER_IDS = 2000;
const MAX_PAGE = 500;

function createNotificationError(statusCode, errorCode, messageUser) {
  return Object.assign(new Error(messageUser), { statusCode, errorCode, messageUser });
}

function notFoundError() {
  return createNotificationError(404, 'NOTIFICATION_NOT_FOUND', 'Không tìm thấy thông báo');
}

function validationError(messageUser) {
  return createNotificationError(400, 'NOTIFICATION_VALIDATION_ERROR', messageUser);
}

/**
 * Chuẩn hoá lỗi từ service để controller trả status đúng; lỗi không xác định
 * thành 500 và không mang message gốc (tên collection, chi tiết Mongo).
 */
function toNotificationError(err) {
  if (err?.statusCode) return err;
  if (err?.name === 'CastError' || err?.name === 'BSONError') {
    return createNotificationError(400, 'NOTIFICATION_INVALID_ID', 'Mã thông báo không hợp lệ');
  }
  return createNotificationError(500, INTERNAL_ERROR_CODE, 'Notification service error');
}

module.exports = {
  BULK_MAX_USER_IDS,
  MAX_PAGE,
  INTERNAL_ERROR_CODE,
  createNotificationError,
  notFoundError,
  validationError,
  toNotificationError,
};
