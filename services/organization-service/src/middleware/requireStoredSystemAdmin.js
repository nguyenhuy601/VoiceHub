const { sendServiceError } = require('./sendServiceError');
const { readStoredSystemAdminState } = require('../clients/storedSystemRole.client');

function actorId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

/**
 * API ghi phân hệ admin (RBAC tổ chức): đối chiếu kho auth, không tin claim JWT.
 */
async function requireStoredSystemAdmin(req, res, next) {
  const userId = actorId(req);
  if (!userId) {
    return sendServiceError(res, 401, {
      errorCode: 'AUTH_NO_TOKEN',
      messageUser: 'Vui lòng đăng nhập lại.',
      message: 'No actor',
    });
  }

  const result = await readStoredSystemAdminState(userId);
  if (result.state === 'unavailable') {
    return sendServiceError(res, 503, {
      errorCode: 'AUTH_SYSTEM_ROLE_UNAVAILABLE',
      messageUser: 'Không thể xác minh quyền quản trị hệ thống. Vui lòng thử lại.',
      message: 'system role lookup failed',
    });
  }
  if (result.state !== 'admin') {
    return sendServiceError(res, 403, {
      errorCode: 'AUTH_SYSTEM_ADMIN_REQUIRED',
      messageUser: 'Chỉ quản trị hệ thống đang hiệu lực mới thực hiện được thao tác này.',
      message: 'Stored system admin required',
    });
  }

  if (req.user) req.user.systemRole = 'admin';
  req.storedSystemAdminVerified = true;
  return next();
}

/**
 * Không chặn. Nếu đúng system admin thì đặt cờ để authorizeOrGrant cho qua (cửa bàn giao).
 */
async function markStoredSystemAdmin(req, res, next) {
  const userId = actorId(req);
  if (!userId) return next();
  const result = await readStoredSystemAdminState(userId);
  if (result.state === 'admin') {
    if (req.user) req.user.systemRole = 'admin';
    req.storedSystemAdminVerified = true;
  }
  return next();
}

module.exports = requireStoredSystemAdmin;
module.exports.markStoredSystemAdmin = markStoredSystemAdmin;
