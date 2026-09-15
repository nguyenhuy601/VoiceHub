const mongoose = require('../db');
const { sendServiceError, sendErrorFromCatch } = require('./sendServiceError');
const {
  resolveUserProjectPermissions,
  hasPermission,
} = require('../services/projectAccess.service');

/**
 * Mandatory resource authorization for /:projectId routes (Wave B).
 * Fail-closed: no user, invalid id, or no project access → 401/400/403.
 */
async function requireProjectAuthorization(req, res, next) {
  try {
    const userId =
      req.user?.id ||
      req.userContext?.userId ||
      String(req.headers['x-user-id'] || '').trim();
    const projectId = String(req.params?.projectId || '').trim();

    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        message: 'Unauthorized',
        messageUser: 'Vui lòng đăng nhập lại.',
      });
    }
    if (!projectId || !mongoose.isValidObjectId(projectId)) {
      return sendServiceError(res, 400, {
        errorCode: 'VALIDATION_INVALID_ID',
        message: 'projectId không hợp lệ',
        messageUser: 'projectId không hợp lệ.',
      });
    }

    const resolved = await resolveUserProjectPermissions({ userId, projectId });
    if (resolved.isOrgAdmin || resolved.isCreator) {
      req.projectAuthz = resolved;
      return next();
    }

    const perms = resolved.permissions || [];
    const canView =
      hasPermission(perms, 'project:view') ||
      hasPermission(perms, 'task:view') ||
      perms.length > 0;

    if (!canView) {
      return sendServiceError(res, 403, {
        errorCode: 'PROJECT_FORBIDDEN',
        message: 'Không có quyền truy cập dự án',
        messageUser: 'Bạn không có quyền truy cập dự án này.',
      });
    }

    req.projectAuthz = resolved;
    return next();
  } catch (err) {
    return sendErrorFromCatch(
      res,
      err,
      err.statusCode || 403,
      'Không có quyền truy cập dự án',
      'PROJECT_FORBIDDEN'
    );
  }
}

module.exports = {
  requireProjectAuthorization,
};
