const UserAuth = require('../models/UserAuth');
const { sendServiceError } = require('./sendServiceError');
const { evaluateStoredSystemAdmin } = require('../utils/storedSystemAdmin');

function actorId(req) {
  return String(req.user?.id || req.user?.userId || req.user?._id || '').trim();
}

/**
 * API ghi phân hệ admin: từ chối khi UserAuth không còn systemRole=admin.
 * Ghi đè claim JWT trên req.user để middleware sau không dùng snapshot cũ.
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

  let row;
  try {
    row = await UserAuth.findOne({ userId }).select('systemRole isActive').lean();
  } catch (error) {
    console.error('[requireStoredSystemAdmin] lookup failed:', error?.code || error?.name || 'unknown');
    return sendServiceError(res, 503, {
      errorCode: 'AUTH_SYSTEM_ROLE_UNAVAILABLE',
      messageUser: 'Không thể xác minh quyền quản trị hệ thống. Vui lòng thử lại.',
      message: 'system role lookup failed',
    });
  }

  const decision = evaluateStoredSystemAdmin(row);
  if (!decision.allow) {
    return sendServiceError(res, 403, {
      errorCode: 'AUTH_SYSTEM_ADMIN_REQUIRED',
      messageUser: 'Chỉ quản trị hệ thống đang hiệu lực mới thực hiện được thao tác này.',
      message: 'Stored system admin required',
    });
  }

  if (req.user) req.user.systemRole = 'admin';
  return next();
}

module.exports = requireStoredSystemAdmin;
