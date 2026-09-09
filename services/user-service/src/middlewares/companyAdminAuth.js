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
 * Gắn req.companyAdmin khi có org + actor là owner/admin/hr.
 * Không 403 — GET peer/chat không gửi org thì giữ peer/self shape.
 */
function attachCompanyAdminIfPresent(req, res, next) {
  const organizationId = readOrganizationId(req);
  if (!organizationId) return next();

  return resolveCompanyAdminLevel(req.user, organizationId)
    .then((level) => {
      if (level) req.companyAdmin = { organizationId, level };
      return next();
    })
    .catch((error) => {
      return res.status(500).json({
        success: false,
        message: error?.message || 'admin check failed',
        errorCode: 'ORG_ADMIN_CHECK_FAILED',
      });
    });
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
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: error?.message || 'admin check failed',
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
