const UserRole = require('../models/UserRole');
const { getRedisClient, logger } = require('@enterprise/shared');
const { isTestUnlockEnabled } = require('../utils/rbacTestUnlock');
const {
  MASTER_PERMISSIONS,
  materializeLegacyPermissions,
  resolveMasterKeysForLegacyAction,
  isValidMasterPermission,
} = require('../config/rbacPermissions');

/**
 * GET user permissions từ Position → Org Role.
 * SoT FE: `grantScopes` { permissionCode: scope }.
 */
function packUserPermissions(grantScopes = {}) {
  const scopes =
    grantScopes && typeof grantScopes === 'object' && !Array.isArray(grantScopes)
      ? grantScopes
      : {};
  const codes = Object.keys(scopes).filter(isValidMasterPermission);
  const normalized = {};
  for (const code of codes) normalized[code] = scopes[code];
  return {
    permissions: codes.length ? materializeLegacyPermissions(codes) : [],
    grantScopes: normalized,
  };
}

let rbacService;
function getRbac() {
  if (!rbacService) rbacService = require('./rbac.service');
  return rbacService;
}

/** Cache mới: mã grantScopes. Mảng legacy `{resource, actions}` bỏ qua — nó gộp nhiều permission vào một resource. */
function readCachedGrantCodes(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.codes)) {
    return null;
  }
  return parsed.codes.map((code) => String(code || '').trim()).filter(Boolean);
}

function grantCodesAllow(codes, action) {
  const actionKey = String(action || '').trim();
  if (!actionKey || !codes.length) return false;
  if (isValidMasterPermission(actionKey) && codes.includes(actionKey)) return true;
  const needed = resolveMasterKeysForLegacyAction(actionKey);
  return needed.length > 0 && needed.some((key) => codes.includes(key));
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
      const cacheKey = `permissions:${userId}:${serverId}`;
      if (redis) {
        const cachedCodes = readCachedGrantCodes(await redis.get(cacheKey));
        if (cachedCodes) {
          const allowed = grantCodesAllow(cachedCodes, action);
          return {
            allowed,
            reason: allowed ? null : 'Insufficient permissions',
          };
        }
      }

      // Cutover: chỉ Position → Org Role → Permission (không UserRole/pack dual).
      let masterGrants = [];
      try {
        masterGrants = await getRbac().collectEffectiveMasterGrants(userId, serverId);
      } catch (e) {
        logger.warn('[permission] collectEffectiveMasterGrants failed', e.message);
      }

      const allowed = grantCodesAllow(masterGrants, action);

      if (redis && masterGrants.length) {
        await redis.setex(cacheKey, 300, JSON.stringify({ codes: masterGrants }));
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
        const all = {};
        for (const code of MASTER_PERMISSIONS) all[code] = 'ORGANIZATION';
        return packUserPermissions(all);
      }

      try {
        const access = await getRbac().collectEffectiveOrgAccess(userId, serverId);
        return packUserPermissions(access.grantScopes);
      } catch (_) {
        return packUserPermissions({});
      }
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
module.exports.packUserPermissions = packUserPermissions;
