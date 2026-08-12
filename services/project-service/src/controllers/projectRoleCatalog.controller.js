const { fetchTaskWorkspaceScope } = require('../services/taskWorkspaceScope');
const { ensureOrgProjectRoles } = require('../services/projectTeam.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

function asUserId(req) {
  return req.user?.id || req.userContext?.userId || '';
}

function asOrgId(req) {
  return String(
    req.headers['x-organization-id'] ||
      req.headers['x-organizationid'] ||
      req.query?.organizationId ||
      req.body?.organizationId ||
      ''
  ).trim();
}

/**
 * Member-readable org Project Role catalog (seed UI).
 * Bất kỳ membership org — không requireOrgAdmin.
 */
async function listRoleCatalog(req, res) {
  try {
    const userId = asUserId(req);
    const orgId = asOrgId(req);
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Bạn cần đăng nhập.',
        message: 'Unauthorized',
      });
    }
    if (!orgId) {
      return sendServiceError(res, 400, {
        errorCode: 'ORG_ID_REQUIRED',
        messageUser: 'Thiếu organizationId.',
        message: 'organizationId required',
      });
    }

    const scope = await fetchTaskWorkspaceScope(userId, orgId);
    if (!scope) {
      return sendServiceError(res, 403, {
        errorCode: 'ORG_ACCESS_DENIED',
        messageUser: 'Bạn không thuộc tổ chức này.',
        message: 'Forbidden',
      });
    }

    const roles = await ensureOrgProjectRoles(orgId);
    const sorted = [...roles].sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
    return res.json({ success: true, data: sorted });
  } catch (err) {
    return sendErrorFromCatch(res, err, err.statusCode || 400, err.message, 'PROJECT_ROLE_CATALOG_FAILED');
  }
}

module.exports = {
  listRoleCatalog,
};
