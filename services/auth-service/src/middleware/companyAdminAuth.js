const { sendServiceError } = require('../middleware/sendServiceError');
const { resolveCompanyAdminLevel, isActiveOrgMember } = require('../clients/orgMembership.client');
const { isObjectIdString } = require('../utils/authInputSafety');

function readOrganizationId(req) {
  return String(
    req.headers['x-organization-id'] ||
      req.body?.organizationId ||
      req.query?.organizationId ||
      ''
  ).trim();
}

/**
 * @param {{ requireFullAccess?: boolean }} options
 * - requireFullAccess: owner/admin/system only (lock, delete account, reset pwd)
 */
function companyAdminAuth(options = {}) {
  const { requireFullAccess = false } = options;

  return async (req, res, next) => {
    try {
      const organizationId = readOrganizationId(req);
      if (!organizationId) {
        return sendServiceError(res, 400, {
          errorCode: 'ORG_ID_REQUIRED',
          messageUser: 'Thiếu mã tổ chức.',
          message: 'organizationId is required',
        });
      }

      const level = await resolveCompanyAdminLevel(req.user, organizationId);
      if (!level) {
        return sendServiceError(res, 403, {
          errorCode: 'ORG_ADMIN_FORBIDDEN',
          messageUser: 'Bạn không có quyền quản trị người dùng.',
          message: 'Forbidden',
        });
      }

      if (requireFullAccess && level === 'hr') {
        return sendServiceError(res, 403, {
          errorCode: 'ORG_ADMIN_FORBIDDEN',
          messageUser: 'Chỉ quản trị viên mới thực hiện được thao tác này.',
          message: 'Full admin required',
        });
      }

      const targetUserId = req.params?.userId;
      if (level !== 'system' && targetUserId !== undefined) {
        if (!isObjectIdString(targetUserId)) {
          return sendServiceError(res, 400, {
            errorCode: 'AUTH_INVALID_ID',
            messageUser: 'Mã định danh không hợp lệ.',
            message: 'userId is invalid',
          });
        }
        const membership = await isActiveOrgMember(organizationId, targetUserId);
        if (membership === 'unavailable') {
          return sendServiceError(res, 503, {
            errorCode: 'AUTH_SCOPE_UNAVAILABLE',
            messageUser: 'Không thể xác minh phạm vi tổ chức lúc này. Vui lòng thử lại.',
          });
        }
        if (membership !== true) {
          return sendServiceError(res, 404, {
            errorCode: 'AUTH_TARGET_NOT_FOUND',
            messageUser: 'Không tìm thấy tài khoản trong tổ chức này.',
            message: 'Target user not found',
          });
        }
      }

      req.companyAdmin = { organizationId, level };
      return next();
    } catch (error) {
      console.error('[companyAdminAuth] admin check failed:', error?.code || error?.name || 'unknown');
      return sendServiceError(res, 500, {
        errorCode: 'ORG_ADMIN_CHECK_FAILED',
        messageUser: 'Không thể xác minh quyền quản trị.',
      });
    }
  };
}

module.exports = {
  companyAdminAuth,
  readOrganizationId,
};
