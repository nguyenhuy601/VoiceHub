/**
 * PDP permission cache keys (B3) — role-permission / gateway đọc; invalidate theo rbac events.
 */

function permissionSetCacheKey(userId, scopeType, scopeId) {
  return `perm:${String(scopeType)}:${String(scopeId)}:user:${String(userId)}`;
}

function orgPermissionSetCacheKey(userId, organizationId) {
  return permissionSetCacheKey(userId, 'org', organizationId);
}

function projectPermissionSetCacheKey(userId, projectId) {
  return permissionSetCacheKey(userId, 'project', projectId);
}

function permissionSetCachePatternForUser(userId) {
  return `perm:*:user:${String(userId)}`;
}

function permissionSetCachePatternForOrg(organizationId) {
  return `perm:org:${String(organizationId)}:user:*`;
}

const DEFAULT_PERMISSION_CACHE_TTL_SEC = Number(
  process.env.PERMISSION_CACHE_TTL_SEC || 120
);

module.exports = {
  permissionSetCacheKey,
  orgPermissionSetCacheKey,
  projectPermissionSetCacheKey,
  permissionSetCachePatternForUser,
  permissionSetCachePatternForOrg,
  DEFAULT_PERMISSION_CACHE_TTL_SEC,
};
