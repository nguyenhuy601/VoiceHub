const { mongoose } = require('@enterprise/shared/config/mongo');
const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const { roleWebhook } = require('../clients/webhook.client');
const { getRedisClient, logger } = require('@enterprise/shared');
const axios = require('axios');
const { canonicalizeSystemRoleName } = require('@enterprise/shared/utils/roleLayerNaming');
const { isHierarchyRoleName, coercePermissionPackScope } = require('../utils/permissionPackScope');
const { activeUserRoleQuery, mapPopulatedUserRoles } = require('../utils/assignedUserRoles');

const ORGANIZATION_SERVICE_URL = String(process.env.ORGANIZATION_SERVICE_URL || '').trim().replace(/\/+$/, '');
if (!ORGANIZATION_SERVICE_URL) throw new Error('Thiếu biến môi trường: ORGANIZATION_SERVICE_URL');
const GATEWAY_INTERNAL_TOKEN = String(process.env.GATEWAY_INTERNAL_TOKEN || '').trim();

function roleServiceError(message, statusCode = 400, errorCode = 'ROLE_OPERATION_FAILED') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

function internalOrgHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(GATEWAY_INTERNAL_TOKEN ? { 'x-gateway-internal-token': GATEWAY_INTERNAL_TOKEN } : {}),
  };
}

function normalizeSystemRoleNameForPersist(name) {
  const current = String(name || '').trim();
  if (!current || isHierarchyRoleName(current)) return current;
  return canonicalizeSystemRoleName(current) || current;
}

/** serverId trong RBAC = organizationId (không có /api/servers trên organization-service). */
async function fetchOrganizationDisplayName(serverId, role) {
  const orgId = String(role?.organizationId || serverId || '').trim();
  if (!orgId) return 'Organization';
  if (!GATEWAY_INTERNAL_TOKEN) return 'Organization';
  try {
    const res = await axios.get(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/org/${encodeURIComponent(orgId)}/summary`,
      { headers: internalOrgHeaders(), timeout: 5000, validateStatus: () => true }
    );
    if (res.status === 200) {
      return res.data?.data?.name || res.data?.name || 'Organization';
    }
  } catch (e) {
    logger.warn('[role.service] fetchOrganizationDisplayName failed', e.message);
  }
  return 'Organization';
}

async function syncOrgMembershipPlacement(userId, organizationId) {
  if (!GATEWAY_INTERNAL_TOKEN || !userId || !organizationId) {
    return {
      attempted: false,
      success: false,
      reason: 'missing_internal_token_or_ids',
    };
  }
  try {
    const res = await axios.post(
      `${ORGANIZATION_SERVICE_URL}/api/organizations/internal/sync-membership-placement`,
      { userId: String(userId), organizationId: String(organizationId) },
      {
        headers: internalOrgHeaders(),
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    const ok = res.status >= 200 && res.status < 300 && res.data?.success !== false;
    if (!ok) {
      logger.warn('[role.service] syncOrgMembershipPlacement non-2xx', {
        status: res.status,
        userId: String(userId),
        organizationId: String(organizationId),
        message: res.data?.message,
      });
    }
    return {
      attempted: true,
      success: ok,
      status: res.status,
      message: res.data?.message || '',
      data: res.data?.data || null,
    };
  } catch (e) {
    logger.warn('[role.service] syncOrgMembershipPlacement failed', e.message);
    return {
      attempted: true,
      success: false,
      reason: 'request_failed',
      message: e.message,
    };
  }
}

class RoleService {
  async mergeDuplicateSystemRole({
    sourceRole,
    targetRole,
  }) {
    const assignments = await UserRole.find({
      roleId: sourceRole._id,
      serverId: sourceRole.serverId,
      isActive: true,
    }).lean();

    for (const assignment of assignments) {
      await UserRole.updateOne(
        {
          userId: assignment.userId,
          serverId: assignment.serverId,
          roleId: targetRole._id,
        },
        {
          $setOnInsert: {
            assignedBy: assignment.assignedBy || null,
            assignedAt: assignment.assignedAt || new Date(),
            expiresAt: assignment.expiresAt || null,
          },
          $set: { isActive: true },
        },
        { upsert: true }
      );
      await UserRole.updateOne({ _id: assignment._id }, { $set: { isActive: false } });
    }

    await Role.updateOne(
      { _id: sourceRole._id },
      {
        $set: {
          isActive: false,
          description: String(sourceRole.description || '')
            .concat(sourceRole.description ? ' ' : '')
            .concat(`[merged->${String(targetRole._id)}]`)
            .slice(0, 1000),
        },
      }
    );
  }

  // Tạo role mới
  async createRole(roleData) {
    try {
      const {
        name,
        description,
        scope,
        serverId,
        organizationId,
        permissions,
        color,
        isDefault,
        priority,
        fromTemplateKey,
        permissionGroupId,
        allowBlankLegacy,
      } = roleData;

      // RBAC V2: cấm tạo role/permission blank — chỉ clone template (hoặc internal migration).
      if (
        !allowBlankLegacy &&
        !String(fromTemplateKey || '').trim() &&
        !String(permissionGroupId || '').trim()
      ) {
        throw roleServiceError(
          'Không được tạo role blank. Hãy clone Permission Group từ template hệ thống.',
          400,
          'RBAC_V2_CLONE_REQUIRED'
        );
      }

      const normalizedName = normalizeSystemRoleNameForPersist(name);

      // Kiểm tra role name đã tồn tại trong server chưa
      const existingRole = await Role.findOne({ name: normalizedName, serverId });
      if (existingRole) {
        throw roleServiceError('Tên vai trò đã tồn tại trong tổ chức', 400, 'ROLE_NAME_EXISTS');
      }

      const normalizedScope = coercePermissionPackScope(normalizedName, scope);

      const role = new Role({
        name: normalizedName,
        description: description != null ? String(description).trim() : '',
        scope: normalizedScope,
        serverId,
        organizationId,
        permissions: permissions || [],
        color: color || '#5865F2',
        isDefault: isDefault || false,
        priority: priority || 0,
      });

      await role.save();

      // Cache role
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${role._id}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(role));
      }

      logger.info(`Role created: ${role._id}`);
      return role;
    } catch (error) {
      logger.error('Error creating role:', error);
      throw error;
    }
  }

  // Lấy role theo ID
  async getRoleById(roleId) {
    try {
      const role = await Role.findById(roleId);
      return role;
    } catch (error) {
      logger.error('Error getting role:', error);
      throw error;
    }
  }

  // Lấy danh sách roles trong server (hoặc theo organizationId nếu client truyền org id)
  async getRolesByServer(serverId) {
    try {
      const roles = await Role.find({
        isActive: true,
        $or: [{ serverId }, { organizationId: serverId }],
      }).sort({ priority: -1, createdAt: 1 });

      let renamed = 0;
      let merged = 0;
      for (const role of roles) {
        const current = String(role.name || '').trim();
        if (!current || isHierarchyRoleName(current)) continue;
        const next = normalizeSystemRoleNameForPersist(current);
        if (!next || next === current) continue;

        const clash = await Role.findOne({
          _id: { $ne: role._id },
          name: next,
          isActive: true,
          $or: [{ serverId: role.serverId }, { organizationId: role.organizationId || role.serverId }],
        })
          .select('_id')
          .lean();
        if (clash) {
          await this.mergeDuplicateSystemRole({ sourceRole: role, targetRole: clash });
          merged += 1;
          logger.warn('[role.service] merged duplicate system role', {
            from: current,
            to: next,
            roleId: String(role._id),
            targetRoleId: String(clash._id),
          });
          continue;
        }

        role.name = next;
        await role.save();
        renamed += 1;
      }

      if (renamed > 0 || merged > 0) {
        logger.info('[role.service] normalized system role names', {
          serverId: String(serverId),
          renamed,
          merged,
        });
        return Role.find({
          isActive: true,
          $or: [{ serverId }, { organizationId: serverId }],
        }).sort({ priority: -1, createdAt: 1 });
      }

      return roles;
    } catch (error) {
      logger.error('Error getting roles:', error);
      throw error;
    }
  }

  // Gán role cho user
  async assignRoleToUser(userId, serverId, roleId, assignedBy) {
    try {
      // Kiểm tra role tồn tại
      const role = await Role.findById(roleId);
      if (!role || role.serverId.toString() !== serverId.toString()) {
        throw roleServiceError('Không tìm thấy vai trò hợp lệ cho tổ chức', 400, 'ROLE_NOT_FOUND');
      }

      // Kiểm tra đã có role chưa
      const existing = await UserRole.findOne({ userId, serverId, roleId });
      const isHierarchyRole = isHierarchyRoleName(role.name);
      if (existing) {
        logger.info(`Role already assigned (idempotent): user ${userId}, role ${roleId}, server ${serverId}`);
        const placementSync = isHierarchyRole
          ? await syncOrgMembershipPlacement(userId, serverId)
          : {
              attempted: false,
              success: true,
              reason: 'non_hierarchy_role',
            };
        return {
          userRole: existing,
          roleName: role.name,
          hierarchyRole: isHierarchyRole,
          placementSync,
          idempotent: true,
        };
      }

      const userRole = new UserRole({
        userId,
        serverId,
        roleId,
        assignedBy,
      });

      await userRole.save();

      // Xóa cache permission
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Role assigned: user ${userId}, role ${roleId}, server ${serverId}`);
      const placementSync = isHierarchyRole
        ? await syncOrgMembershipPlacement(userId, serverId)
        : {
            attempted: false,
            success: true,
            reason: 'non_hierarchy_role',
          };
      return {
        userRole,
        roleName: role.name,
        hierarchyRole: isHierarchyRole,
        placementSync,
        idempotent: false,
      };
    } catch (error) {
      logger.error('Error assigning role:', error);
      throw error;
    }
  }

  // Xóa role khỏi user
  async removeRoleFromUser(userId, serverId, roleId) {
    try {
      const userRole = await UserRole.findOneAndDelete({
        userId,
        serverId,
        roleId,
      });

      if (!userRole) {
        throw roleServiceError('Không tìm thấy vai trò đã gán cho người dùng', 404, 'USER_ROLE_NOT_FOUND');
      }

      // Xóa cache permission
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.del(cacheKey);
      }

      let removedRole = null;
      try {
        removedRole = await Role.findById(roleId);
      } catch {
        /* ignore */
      }

      try {
        const role = removedRole || (await Role.findById(roleId));
        if (role?.name) {
          const orgId = String(role.organizationId || serverId || '');
          const serverName = await fetchOrganizationDisplayName(serverId, role);
          await roleWebhook.removed(
            userId.toString(),
            role.name,
            serverId.toString(),
            serverName,
            null,
            orgId || undefined
          );
        }
      } catch (error) {
        logger.warn('[role.service] role removed webhook skipped:', error.message);
      }

      logger.info(`Role removed: user ${userId}, role ${roleId}, server ${serverId}`);
      const isHierarchyRole = Boolean(removedRole && isHierarchyRoleName(removedRole.name));
      const placementSync = isHierarchyRole
        ? await syncOrgMembershipPlacement(userId, serverId)
        : {
            attempted: false,
            success: true,
            reason: 'non_hierarchy_role',
          };
      return {
        userRole,
        roleName: removedRole?.name || '',
        hierarchyRole: isHierarchyRole,
        placementSync,
      };
    } catch (error) {
      logger.error('Error removing role:', error);
      throw error;
    }
  }

  // Lấy roles của user trong server
  async getUserRoles(userId, serverId) {
    try {
      const userRoles = await UserRole.find(activeUserRoleQuery(userId, serverId)).populate('roleId');
      return mapPopulatedUserRoles(userRoles);
    } catch (error) {
      logger.error('Error getting user roles:', error);
      throw error;
    }
  }

  // Cập nhật role
  async updateRole(roleId, updateData) {
    try {
      const allowedFields = ['name', 'description', 'scope', 'permissions', 'color', 'priority', 'isDefault'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      if (updateFields.description !== undefined) {
        updateFields.description = String(updateFields.description || '').trim();
      }
      if (updateFields.name !== undefined) {
        updateFields.name = normalizeSystemRoleNameForPersist(updateFields.name);
      }

      if (updateFields.scope !== undefined) {
        const existing = await Role.findById(roleId).select('name').lean();
        const nameForScope = updateFields.name !== undefined ? updateFields.name : existing?.name;
        updateFields.scope = coercePermissionPackScope(nameForScope, updateFields.scope);
      }

      const role = await Role.findByIdAndUpdate(
        roleId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!role) {
        throw roleServiceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${roleId}`;
        await redis.del(cacheKey);
      }
      const { invalidatePermissionsCacheForRole } = require('../utils/invalidatePermissionCache');
      await invalidatePermissionsCacheForRole(roleId);

      logger.info(`Role updated: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error updating role:', error);
      throw error;
    }
  }

  // Xóa role
  async deleteRole(roleId) {
    try {
      const role = await Role.findByIdAndUpdate(
        roleId,
        { $set: { isActive: false } },
        { new: true }
      );

      if (!role) {
        throw roleServiceError('Không tìm thấy vai trò', 404, 'ROLE_NOT_FOUND');
      }

      // Xóa tất cả user roles
      await UserRole.updateMany(
        { roleId },
        { $set: { isActive: false } }
      );

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${roleId}`;
        await redis.del(cacheKey);
      }
      const { invalidatePermissionsCacheForRole } = require('../utils/invalidatePermissionCache');
      await invalidatePermissionsCacheForRole(roleId);

      logger.info(`Role deleted: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error deleting role:', error);
      throw error;
    }
  }

  /**
   * Xóa toàn bộ UserRole + vô hiệu hóa Role theo ngữ cảnh server/org (serverId = organizationId).
   * Gọi nội bộ khi owner xóa tổ chức.
   */
  async purgeByServerContext(serverId) {
    try {
      const sid = new mongoose.Types.ObjectId(String(serverId));
      const userRolesResult = await UserRole.deleteMany({ serverId: sid });
      const rolesResult = await Role.deleteMany({
        $or: [{ serverId: sid }, { organizationId: sid }],
      });
      logger.info(
        `purgeByServerContext: serverId=${serverId} rolesDeleted=${rolesResult.deletedCount} userRolesDeleted=${userRolesResult.deletedCount}`
      );
      return {
        deletedRoles: rolesResult.deletedCount || 0,
        deletedUserRoles: userRolesResult.deletedCount || 0,
      };
    } catch (error) {
      logger.error('Error purgeByServerContext:', error);
      throw error;
    }
  }

  hasRoleReadPermission(permissions) {
    return (permissions || []).some(
      (perm) =>
        perm?.resource === 'role' &&
        Array.isArray(perm.actions) &&
        (perm.actions.includes('read') || perm.actions.includes('*') || perm.actions.includes('admin'))
    );
  }

  withRoleReadPermission(permissions) {
    const perms = Array.isArray(permissions)
      ? permissions.map((perm) => ({
          resource: perm.resource,
          actions: Array.isArray(perm.actions) ? [...perm.actions] : [],
        }))
      : [];
    const rolePerm = perms.find((perm) => perm.resource === 'role');
    if (rolePerm) {
      if (!rolePerm.actions.includes('read')) {
        rolePerm.actions.push('read');
      }
      return perms;
    }
    perms.push({ resource: 'role', actions: ['read'] });
    return perms;
  }

  /**
   * Bổ sung role:read cho role org cũ (member/admin/HR) để GET /api/roles/* không 403.
   */
  async backfillRoleReadPermission(serverId = null) {
    const filter = {};
    if (serverId) {
      const sid = new mongoose.Types.ObjectId(String(serverId));
      filter.$or = [{ serverId: sid }, { organizationId: sid }];
    }
    const roles = await Role.find(filter).select('permissions serverId').lean();
    let updated = 0;
    const redis = getRedisClient();
    const touchedServers = new Set();

    for (const role of roles) {
      if (this.hasRoleReadPermission(role.permissions)) continue;
      const nextPermissions = this.withRoleReadPermission(role.permissions);
      await Role.updateOne({ _id: role._id }, { $set: { permissions: nextPermissions } });
      updated += 1;
      if (role.serverId) touchedServers.add(String(role.serverId));
    }

    if (redis && touchedServers.size > 0) {
      for (const sid of touchedServers) {
        try {
          const keys = await redis.keys(`permissions:*:${sid}`);
          if (keys?.length) await redis.del(...keys);
        } catch (cacheErr) {
          logger.warn('[role.service] backfillRoleReadPermission cache purge', cacheErr.message);
        }
      }
    }

    return { scanned: roles.length, updated, serverId: serverId ? String(serverId) : null };
  }
}

module.exports = new RoleService();

