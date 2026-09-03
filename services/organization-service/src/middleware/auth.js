const { orgUnauthorized, orgAccessDenied, sendServiceError } = require('../utils/orgApiError');
const axios = require('axios');
const { isTrustedGatewayForward } = require('@enterprise/shared/middleware/gatewayTrust');
const { checkMasterGrant } = require('../clients/rbacPermission.client');
const { resolveAuthorizeOrGrant } = require('../utils/authorizeOrGrantDecision');
const { resolveOrgAccess } = require('../utils/orgAccess');

const AUTH_SERVICE_URL = String(process.env.AUTH_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!AUTH_SERVICE_URL) throw new Error('Thiếu biến môi trường: AUTH_SERVICE_URL');

const getHeader = (headers, key) => headers[key] || headers[key.toLowerCase()];

exports.protect = async (req, res, next) => {
  try {
    const forwardedUserId = getHeader(req.headers, 'x-user-id');
    // Chỉ tin x-user-id khi request đi qua API Gateway (x-gateway-internal-token hợp lệ)
    if (forwardedUserId && isTrustedGatewayForward(req)) {
      req.user = {
        id: forwardedUserId,
        userId: forwardedUserId,
        email: getHeader(req.headers, 'x-user-email') || null,
        systemRole: String(getHeader(req.headers, 'x-user-system-role') || '')
          .trim()
          .toLowerCase(),
      };
      return next();
    }
    // Có x-user-id nhưng không tin cậy (thiếu/sai GATEWAY_INTERNAL_TOKEN ở service) — không chặn 401;
    // tiếp tục xác thực bằng JWT để khớp với api-gateway đã verify token.

    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return orgUnauthorized(res);
    }

    // Verify token with auth service (timeout tránh treo cả chuỗi search → chat-service 503)
    const response = await axios.get(`${AUTH_SERVICE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: Number(process.env.AUTH_HTTP_TIMEOUT_MS || 8000),
    });

    const user = response.data?.data?.user || response.data?.user || {};
    req.user = {
      ...user,
      id: user.id || user.userId || user._id,
    };
    next();
  } catch (error) {
    return sendServiceError(res, 401, {
      errorCode: 'AUTH_TOKEN_INVALID',
      messageUser: 'Phiên đăng nhập không hợp lệ.',
      message: 'Invalid token',
    });
  }
};

async function loadActiveMembership(req) {
  const Membership = require('../models/Membership');
  const orgId = req.params.orgId || req.params.id;
  const userId = req.user?.id || req.user?._id || req.user?.userId;
  const access = await resolveOrgAccess(userId, orgId);
  const membership = access.membership || null;
  const normalizedRole = membership ? Membership.normalizeRole(membership.role) : null;
  return { membership, normalizedRole, orgId, userId, orgAccessOk: access.ok };
}

function membershipPlain(membership) {
  if (!membership) return null;
  return typeof membership.toObject === 'function' ? membership.toObject() : { ...membership };
}

exports.authorize = (roles) => {
  return async (req, res, next) => {
    const { membership, normalizedRole } = await loadActiveMembership(req);
    if (!membership || !roles.includes(normalizedRole)) {
      return orgAccessDenied(res);
    }

    req.membership = { ...membershipPlain(membership), normalizedRole };
    next();
  };
};

/** owner/admin (roles) hoặc đã vào org và có master grant V2 — không bypass systemRole. */
exports.authorizeOrGrant = (roles, masterKey) => {
  return async (req, res, next) => {
    const { membership, normalizedRole, orgId, userId, orgAccessOk } = await loadActiveMembership(req);
    const membershipPass = resolveAuthorizeOrGrant({
      membership,
      normalizedRole,
      roles,
      grantAllowed: false,
    });
    if (membershipPass.allow) {
      req.membership = { ...membershipPlain(membership), normalizedRole };
      return next();
    }
    const grantAllowed =
      orgAccessOk && masterKey ? await checkMasterGrant(userId, orgId, masterKey) : false;
    const decision = resolveAuthorizeOrGrant({
      membership,
      normalizedRole,
      roles,
      grantAllowed,
      orgAccessOk,
    });
    if (!decision.allow) {
      return orgAccessDenied(res);
    }
    req.membership = membership
      ? { ...membershipPlain(membership), normalizedRole }
      : { role: 'member', normalizedRole: 'member' };
    next();
  };
};

/** Chỉ master grant V2 — không bypass org membership role. */
exports.authorizeGrant = (masterKey) => exports.authorizeOrGrant([], masterKey);
