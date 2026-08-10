/**
 * Pure helpers for PDP cache — unit-testable without Redis.
 */
const {
  orgPermissionSetCacheKey,
  projectPermissionSetCacheKey,
  DEFAULT_PERMISSION_CACHE_TTL_SEC,
} = require('@enterprise/shared/cache/permissionCacheKeys');

function buildOrgPermissionCacheEntry(userId, organizationId, permissions) {
  return {
    key: orgPermissionSetCacheKey(userId, organizationId),
    ttlSec: DEFAULT_PERMISSION_CACHE_TTL_SEC,
    value: {
      userId: String(userId),
      organizationId: String(organizationId),
      permissions: Array.isArray(permissions) ? permissions.map(String) : [],
      cachedAt: new Date().toISOString(),
    },
  };
}

function buildProjectPermissionCacheEntry(userId, projectId, permissions) {
  return {
    key: projectPermissionSetCacheKey(userId, projectId),
    ttlSec: DEFAULT_PERMISSION_CACHE_TTL_SEC,
    value: {
      userId: String(userId),
      projectId: String(projectId),
      permissions: Array.isArray(permissions) ? permissions.map(String) : [],
      cachedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  buildOrgPermissionCacheEntry,
  buildProjectPermissionCacheEntry,
};
