const Role = require('../models/Role');
const permissionService = require('../services/permission.service');
const { logger } = require('@enterprise/shared');
const { sendServiceError } = require('./sendServiceError');
const {
  collectRequestedOrgIds,
  resolveRoleBoundOrg,
  resolveRequestOrg,
  roleOrgIdsFromDoc,
} = require('../utils/roleOrgScope');

async function resolveTrustedOrganizationId(req) {
  const requestedOrgIds = collectRequestedOrgIds(req);
  const roleId = req.params?.roleId;

  if (roleId) {
    const role = await Role.findById(roleId).select('organizationId serverId isActive').lean();
    if (!role || role.isActive === false) {
      return {
        ok: false,
        status: 404,
        errorCode: 'ROLE_NOT_FOUND',
        message: 'Role not found',
      };
    }
    const bound = resolveRoleBoundOrg({
      requestedOrgIds,
      roleOrgIds: roleOrgIdsFromDoc(role),
    });
    if (!bound.ok) {
      logger.warn('[role] org mismatch', { roleId: String(roleId), action: 'role:read' });
    }
    return bound;
  }

  return resolveRequestOrg({ requestedOrgIds });
}

function requireRolePermission(action) {
  return async (req, res, next) => {
    try {
      const resolved = await resolveTrustedOrganizationId(req);
      if (!resolved.ok) {
        return sendServiceError(res, resolved.status, {
          errorCode: resolved.errorCode,
          message: resolved.message,
          messageUser: resolved.message,
        });
      }

      req.resolvedOrganizationId = String(resolved.organizationId);
      req.roleOrgContext = { organizationId: req.resolvedOrganizationId };

      if (req.isInternalServiceCall) {
        return next();
      }

      const userId = req.user?.id || req.user?.userId;
      if (!userId) {
        return sendServiceError(res, 401, {
          errorCode: 'ROLE_UNAUTHORIZED',
          message: 'Unauthorized',
          messageUser: 'Unauthorized',
        });
      }

      const paramUserId = req.params?.userId ? String(req.params.userId).trim() : null;
      if (paramUserId && paramUserId === String(userId) && action === 'role:read') {
        return next();
      }

      const result = await permissionService.checkPermission(
        userId,
        req.resolvedOrganizationId,
        action
      );
      if (!result.allowed) {
        return sendServiceError(res, 403, {
          errorCode: 'ROLE_FORBIDDEN',
          message: 'Insufficient permissions',
          messageUser: 'Insufficient permissions',
        });
      }

      return next();
    } catch (error) {
      logger.error('[requireRolePermission]', error);
      return sendServiceError(res, 500, {
        errorCode: 'ROLE_INTERNAL_ERROR',
        message: 'Permission check failed',
        messageUser: 'Permission check failed',
      });
    }
  };
}

module.exports = {
  requireRolePermission,
};
