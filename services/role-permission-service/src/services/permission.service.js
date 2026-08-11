const UserRole = require('../models/UserRole');
const Role = require('../models/Role');
const { getRedisClient, logger } = require('@enterprise/shared');
const { isTestUnlockEnabled } = require('../utils/rbacTestUnlock');
const {
  materializeLegacyPermissions,
  resolveMasterKeysForLegacyAction,
  isValidMasterPermission,
} = require('../config/rbacV2Catalog');

let rbacV2Service;
function getRbacV2() {
  if (!rbacV2Service) rbacV2Service = require('./rbacV2.service');
  return rbacV2Service;
}

class PermissionService {
  async checkPermission(userId, serverId, action) {
    try {
      if (isTestUnlockEnabled()) {
        return {
          allowed: true,
          reason: null,
        };
      }

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          const permissions = JSON.parse(cached);
          const allowed = this.hasPermission(permissions, action);
          return {
            allowed,
            reason: allowed ? null : 'Insufficient permissions',
          };
        }
      }

      // Union grants từ mọi gói Permission đã bind (checkPermission).
      // Follow-up: gắn từng API vào matrix gói — hiện nhiều gate vẫn Membership/Org Role (vd. org planner).
      // Chưa invent master key PM trong wave naming.
      let masterGrants = [];
      try {
        masterGrants = await getRbacV2().collectEffectiveMasterGrants(userId, serverId);
      } catch (e) {
        logger.warn('[permission] collectEffectiveMasterGrants failed', e.message);
      }

      if (masterGrants.length) {
        const actionKey = String(action || '').trim();
        if (isValidMasterPermission(actionKey) && masterGrants.includes(actionKey)) {
          const materialized = materializeLegacyPermissions(masterGrants);
          if (redis) {
            await redis.setex(`permissions:${userId}:${serverId}`, 300, JSON.stringify(materialized));
          }
          return { allowed: true, reason: null };
        }
        const needed = resolveMasterKeysForLegacyAction(actionKey);
        if (needed.length && needed.some((k) => masterGrants.includes(k))) {
          const materialized = materializeLegacyPermissions(masterGrants);
          if (redis) {
            await redis.setex(`permissions:${userId}:${serverId}`, 300, JSON.stringify(materialized));
          }
          return { allowed: true, reason: null };
        }
      }

      // Fallback / also cache materialize: Role.permissions (rematerialized from groups)
      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).populate('roleId');

      const allPermissions = [];
      for (const userRole of userRoles) {
        if (userRole.roleId && userRole.roleId.permissions) {
          allPermissions.push(...userRole.roleId.permissions);
        }
      }

      // If we have master grants but legacy action didn't match via adapter, deny via master path
      // still allow Role.permissions fallback for any rematerialized entries
      const allowed = this.hasPermission(allPermissions, action);

      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        const toCache =
          masterGrants.length > 0
            ? materializeLegacyPermissions(masterGrants)
            : allPermissions;
        await redis.setex(cacheKey, 300, JSON.stringify(toCache));
      }

      return {
        allowed,
        reason: allowed ? null : 'Insufficient permissions',
      };
    } catch (error) {
      logger.error('Error checking permission:', error);
      return {
        allowed: false,
        reason: 'Permission check failed',
      };
    }
  }

  hasPermission(permissions, action) {
    if (!permissions || permissions.length === 0) {
      return false;
    }

    const actionKey = String(action || '').trim();
    if (isValidMasterPermission(actionKey)) {
      // Role.permissions is legacy shape — map via reverse check of materialize
      const neededLegacy = materializeLegacyPermissions([actionKey]);
      for (const entry of neededLegacy) {
        for (const perm of permissions) {
          if (perm.resource === entry.resource || perm.resource === '*') {
            if (
              entry.actions.some(
                (a) =>
                  (perm.actions || []).includes(a) ||
                  (perm.actions || []).includes('*') ||
                  (perm.actions || []).includes('admin')
              )
            ) {
              return true;
            }
          }
        }
      }
      return false;
    }

    const [resource, actionType] = actionKey.split(':');
    if (!resource || !actionType) return false;

    for (const perm of permissions) {
      if (perm.resource === resource || perm.resource === '*') {
        if (
          (perm.actions || []).includes(actionType) ||
          (perm.actions || []).includes('*') ||
          (perm.actions || []).includes('admin')
        ) {
          return true;
        }
      }
    }

    return false;
  }

  async getUserPermissions(userId, serverId) {
    try {
      if (isTestUnlockEnabled()) {
        return [{ resource: '*', actions: ['*'] }];
      }

      let masterGrants = [];
      try {
        masterGrants = await getRbacV2().collectEffectiveMasterGrants(userId, serverId);
      } catch (_) {
        /* ignore */
      }
      if (masterGrants.length) {
        return materializeLegacyPermissions(masterGrants);
      }

      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      }).populate('roleId');

      const allPermissions = [];
      for (const userRole of userRoles) {
        if (userRole.roleId && userRole.roleId.permissions) {
          allPermissions.push(...userRole.roleId.permissions);
        }
      }

      return allPermissions;
    } catch (error) {
      logger.error('Error getting user permissions:', error);
      throw new Error(`Error getting user permissions: ${error.message}`);
    }
  }

  async getUserRole(userId, serverId) {
    try {
      if (isTestUnlockEnabled()) {
        return {
          name: 'RBAC Test Unlock',
          permissions: [{ resource: '*', actions: ['*'] }],
          color: '#22c55e',
          priority: 9999,
          isDefault: false,
        };
      }

      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
      })
        .populate('roleId', 'name permissions color')
        .sort({ 'roleId.priority': -1 })
        .limit(1);

      if (userRoles.length === 0) {
        return null;
      }

      return userRoles[0].roleId;
    } catch (error) {
      logger.error('Error getting user role:', error);
      return null;
    }
  }
}

module.exports = new PermissionService();
