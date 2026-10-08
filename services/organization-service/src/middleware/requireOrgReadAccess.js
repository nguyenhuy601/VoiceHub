const { orgAccessDenied, orgCatch } = require('../utils/orgApiError');

/** Đọc cấu trúc org: membership active hoặc có RBAC role trong org (RULE-10). */
function createRequireOrgReadAccess(resolveAccess) {
  return async function requireOrgReadAccess(req, res, next) {
    try {
      const orgId = req.params.orgId;
      const userId = req.user?.id || req.user?.userId || req.user?._id;
      if (!orgId || !userId) return orgAccessDenied(res);
      const access = await resolveAccess(userId, orgId);
      if (!access?.ok) return orgAccessDenied(res);
      return next();
    } catch (error) {
      return orgCatch(res, error);
    }
  };
}

function requireOrgReadAccess(req, res, next) {
  const { resolveOrgAccess } = require('../utils/orgAccess');
  return createRequireOrgReadAccess(resolveOrgAccess)(req, res, next);
}

module.exports = { requireOrgReadAccess, createRequireOrgReadAccess };
