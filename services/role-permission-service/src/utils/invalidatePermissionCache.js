const UserRole = require('../models/UserRole');
const { getRedisClient, logger } = require('@enterprise/shared');

async function invalidatePermissionsCacheForRole(roleId) {
  const rid = String(roleId || '').trim();
  if (!rid) return;

  const rows = await UserRole.find({ roleId: rid, isActive: true })
    .select('userId serverId')
    .lean();

  const redis = getRedisClient();
  if (!redis || !rows.length) return;

  const keys = rows
    .map((r) => {
      const uid = String(r.userId || '').trim();
      const sid = String(r.serverId || '').trim();
      if (!uid || !sid) return null;
      return `permissions:${uid}:${sid}`;
    })
    .filter(Boolean);

  if (!keys.length) return;

  try {
    await redis.del(...keys);
  } catch (e) {
    logger.warn('[invalidatePermissionCache] redis del failed:', e.message);
  }
}

module.exports = { invalidatePermissionsCacheForRole };
