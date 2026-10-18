const { getRedisClient, logger } = require('@enterprise/shared');

/**
 * Xóa Redis `permissions:{userId}:{orgId}` (TTL 300s ở role-permission checkPermission).
 * Cùng key với invalidatePermissionCache.js — org-service không require sang service kia.
 */
async function invalidatePermissionCacheForUsers(organizationId, userIds) {
  const orgId = String(organizationId || '').trim();
  const ids = [...new Set((userIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!orgId || !ids.length) return 0;
  const redis = getRedisClient();
  if (!redis || typeof redis.del !== 'function') return 0;
  const keys = ids.map((uid) => `permissions:${uid}:${orgId}`);
  try {
    await redis.del(...keys);
    return keys.length;
  } catch (error) {
    logger.warn('[grantPermissionCache] redis del failed:', error.message);
    return 0;
  }
}

module.exports = { invalidatePermissionCacheForUsers };
