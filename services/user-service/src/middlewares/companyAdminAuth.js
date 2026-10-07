const { resolveCompanyAdminLevel, isActiveOrgMember } = require('../clients/orgMembership.client');
const { logger } = require('@enterprise/shared');
const { isObjectIdString } = require('../utils/userInputSafety');

function readOrganizationId(req) {
  return String(
    req.headers['x-organization-id'] ||
      req.body?.organizationId ||
      req.query?.organizationId ||
      ''
  ).trim();
}

function actorIdOf(req) {
  return String(req.user?.id || req.user?._id || req.userContext?.userId || '').trim();
}

/**
 * Admin org chỉ có quyền trên user là thành viên active của org đó.
 * Không phải thành viên / org-service lỗi → không gắn admin (degrade về peer/forbidden),
 * vì GET /users/:id dùng chung cho peer/chat — trả 404 sẽ làm hỏng hiển thị hồ sơ.
 */
async function isTargetInScope(req, level, organizationId) {
  if (level === 'system') return true;
  const targetId = String(req.params?.userId || '').trim();
  if (!targetId) return true;
  if (targetId === actorIdOf(req)) return true;
  if (!isObjectIdString(targetId)) return false;

  const member = await isActiveOrgMember(organizationId, targetId);
  if (member === true) return true;
  if (member === 'unavailable') {
    logger.warn(`[user-service] scope unavailable target=${targetId}`);
  } else {
    logger.info(`[user-service] scope target not member target=${targetId}`);
  }
  return false;
}

/**
 * Gắn req.companyAdmin khi có org + actor là owner/admin/hr + target thuộc org.
 * Không 403 — GET peer/chat không gửi org thì giữ peer/self shape.
 */
async function attachCompanyAdminIfPresent(req, res, next) {
  const organizationId = readOrganizationId(req);
  if (!organizationId) return next();

  try {
    const level = await resolveCompanyAdminLevel(req.user, organizationId);
    if (level && (await isTargetInScope(req, level, organizationId))) {
      req.companyAdmin = { organizationId, level };
    }
    return next();
  } catch {
    return res.status(500).json({
      success: false,
      message: 'admin check failed',
      errorCode: 'ORG_ADMIN_CHECK_FAILED',
    });
  }
}

function companyAdminAuth(options = {}) {
  const { requireFullAccess = false } = options;

  return async (req, res, next) => {
    try {
      const organizationId = readOrganizationId(req);
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'organizationId is required',
          errorCode: 'ORG_ID_REQUIRED',
        });
      }

      const level = await resolveCompanyAdminLevel(req.user, organizationId);
      if (!level) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
          errorCode: 'ORG_ADMIN_FORBIDDEN',
        });
      }

      if (requireFullAccess && level === 'hr') {
        return res.status(403).json({
          success: false,
          message: 'Full admin required',
          errorCode: 'ORG_ADMIN_FORBIDDEN',
        });
      }

      req.companyAdmin = { organizationId, level };
      return next();
    } catch {
      return res.status(500).json({
        success: false,
        message: 'admin check failed',
        errorCode: 'ORG_ADMIN_CHECK_FAILED',
      });
    }
  };
}

module.exports = {
  companyAdminAuth,
  attachCompanyAdminIfPresent,
  readOrganizationId,
};
