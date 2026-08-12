const { sendServiceError } = require('../middleware/sendServiceError');
const { resolveCompanyAdminLevel } = require('../clients/orgMembership.client');

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

      req.companyAdmin = { organizationId, level };
      return next();
    } catch (error) {
      return sendServiceError(res, 500, {
        errorCode: 'ORG_ADMIN_CHECK_FAILED',
        messageUser: 'Không thể xác minh quyền quản trị.',
        message: error?.message || 'admin check failed',
      });
    }
  };
}

module.exports = {
  companyAdminAuth,
  readOrganizationId,
};
