const axios = require('axios');
const Role = require('../models/Role');
const { logger } = require('@enterprise/shared');
const { sendServiceError } = require('./sendServiceError');
const {
  collectRequestedOrgIds,
  resolveRoleBoundOrg,
  resolveRequestOrg,
  roleOrgIdsFromDoc,
} = require('../utils/roleOrgScope');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function internalOrgHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(GATEWAY_INTERNAL_TOKEN ? { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN } : {}),
  };
}

async function fetchMembershipRole(userId, organizationId) {
  if (!GATEWAY_INTERNAL_TOKEN || !userId || !organizationId) return null;
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/membership/${encodeURIComponent(organizationId)}/${encodeURIComponent(userId)}`,
      { headers: internalOrgHeaders(), timeout: 8000, validateStatus: () => true }
    );
    if (res.status !== 200) return null;
    return String(res.data?.data?.role || '').toLowerCase();
  } catch (e) {
    logger.warn('[requireOrgRoleManager] membership lookup failed', e.message);
    return null;
  }
}

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
      logger.warn('[role] org mismatch', { roleId: String(roleId), action: req.method });
    }
    return bound;
  }

  return resolveRequestOrg({ requestedOrgIds });
}

/** Chỉ owner/admin của tổ chức mới được CRUD role / gán role. S2S (hierarchy sync) được phép. */
async function requireOrgRoleManager(req, res, next) {
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

    const membershipRole = await fetchMembershipRole(String(userId), req.resolvedOrganizationId);
    if (!membershipRole || !['owner', 'admin'].includes(membershipRole)) {
      return sendServiceError(res, 403, {
        errorCode: 'ROLE_FORBIDDEN',
        message: 'Access denied: organization admin required',
        messageUser: 'Access denied: organization admin required',
      });
    }

    return next();
  } catch (err) {
    logger.error('[requireOrgRoleManager]', err);
    return sendServiceError(res, 500, {
      errorCode: 'ROLE_INTERNAL_ERROR',
      message: 'Authorization check failed',
      messageUser: 'Authorization check failed',
    });
  }
}

/** GET role: thành viên org HOẶC gọi S2S nội bộ (organization-service sync, không có x-user-id). */
async function requireOrgMember(req, res, next) {
  try {
    const organizationId = req.params?.serverId || req.params?.organizationId;
    if (!organizationId) {
      return sendServiceError(res, 400, {
        errorCode: 'ROLE_ORG_REQUIRED',
        message: 'serverId is required',
        messageUser: 'serverId is required',
      });
    }

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

    const membershipRole = await fetchMembershipRole(String(userId), String(organizationId));
    if (!membershipRole) {
      return sendServiceError(res, 403, {
        errorCode: 'ROLE_FORBIDDEN',
        message: 'Access denied: not a member of this organization',
        messageUser: 'Access denied: not a member of this organization',
      });
    }

    return next();
  } catch (err) {
    logger.error('[requireOrgMember]', err);
    return sendServiceError(res, 500, {
      errorCode: 'ROLE_INTERNAL_ERROR',
      message: 'Authorization check failed',
      messageUser: 'Authorization check failed',
    });
  }
}

/** Chỉ xem role của chính mình hoặc org admin. S2S (sync membership) được phép. */
async function requireSelfOrOrgManager(req, res, next) {
  try {
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

    const targetUserId = req.params?.userId;
    const serverId = req.params?.serverId;
    if (String(targetUserId) === String(userId)) {
      return next();
    }

    const membershipRole = await fetchMembershipRole(String(userId), String(serverId));
    if (membershipRole && ['owner', 'admin'].includes(membershipRole)) {
      return next();
    }

    return sendServiceError(res, 403, {
      errorCode: 'ROLE_FORBIDDEN',
      message: 'Access denied',
      messageUser: 'Access denied',
    });
  } catch (err) {
    logger.error('[requireSelfOrOrgManager]', err);
    return sendServiceError(res, 500, {
      errorCode: 'ROLE_INTERNAL_ERROR',
      message: 'Authorization check failed',
      messageUser: 'Authorization check failed',
    });
  }
}

module.exports = {
  requireOrgRoleManager,
  requireOrgMember,
  requireSelfOrOrgManager,
};
