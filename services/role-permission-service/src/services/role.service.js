const Role = require('../models/Role');
const UserRole = require('../models/UserRole');
const { getRedisClient, roleWebhook, logger } = require('/shared');
const axios = require('axios');

const ORGANIZATION_SERVICE_URL = process.env.ORGANIZATION_SERVICE_URL || 'http://organization-service:3013';

class RoleService {
  // Tạo role mới
  async createRole(roleData) {
    try {
      const { name, serverId, organizationId, permissions, color, isDefault, priority } = roleData;

      // Kiểm tra role name đã tồn tại trong server chưa
      const existingRole = await Role.findOne({ name, serverId });
      if (existingRole) {
        throw new Error('Role name already exists in this server');
      }

      const role = new Role({
        name,
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
      throw new Error(`Error creating role: ${error.message}`);
    }
  }

  // Lấy role theo ID
  async getRoleById(roleId) {
    try {
      const role = await Role.findById(roleId);
      return role;
    } catch (error) {
      logger.error('Error getting role:', error);
      throw new Error(`Error getting role: ${error.message}`);
    }
  }

  // Lấy danh sách roles trong server
  async getRolesByServer(serverId) {
    try {
      const roles = await Role.find({
        serverId,
        isActive: true,
      }).sort({ priority: -1, createdAt: 1 });

      return roles;
    } catch (error) {
      logger.error('Error getting roles:', error);
      throw new Error(`Error getting roles: ${error.message}`);
    }
  }

  // Gán role cho user
  async assignRoleToUser(userId, serverId, roleId, assignedBy) {
    try {
      // Kiểm tra role tồn tại
      const role = await Role.findById(roleId);
      if (!role || role.serverId.toString() !== serverId.toString()) {
        throw new Error('Role not found or invalid for this server');
      }

      // Kiểm tra đã có role chưa
      const existing = await UserRole.findOne({ userId, serverId, roleId });
      if (existing) {
        throw new Error('User already has this role');
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
      return userRole;
    } catch (error) {
      logger.error('Error assigning role:', error);
      throw new Error(`Error assigning role: ${error.message}`);
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
        throw new Error('User role not found');
      }

      // Xóa cache permission
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `permissions:${userId}:${serverId}`;
        await redis.del(cacheKey);
      }

      // Gửi webhook
      try {
        const role = await Role.findById(roleId);
        const serverResponse = await axios.get(`${ORGANIZATION_SERVICE_URL}/api/servers/${serverId}`);
        const serverName = serverResponse.data?.data?.name || 'Server';
        
        await roleWebhook.removed(
          userId.toString(),
          role.name,
          serverId.toString(),
          serverName,
          null, // removedBy - có thể lấy từ context
          role.organizationId?.toString()
        );
      } catch (error) {
        logger.error('Error sending role removed webhook:', error);
      }

      logger.info(`Role removed: user ${userId}, role ${roleId}, server ${serverId}`);
      return userRole;
    } catch (error) {
      logger.error('Error removing role:', error);
      throw new Error(`Error removing role: ${error.message}`);
    }
  }

  // Lấy roles của user trong server
  async getUserRoles(userId, serverId) {
    try {
      const userRoles = await UserRole.find({
        userId,
        serverId,
        isActive: true,
        $or: [
          { expiresAt: null },
          { expiresAt: { $gt: new Date() } },
        ],
      }).populate('roleId');

      return userRoles.map((ur) => ur.roleId);
    } catch (error) {
      logger.error('Error getting user roles:', error);
      throw new Error(`Error getting user roles: ${error.message}`);
    }
  }

  // Cập nhật role
  async updateRole(roleId, updateData) {
    try {
      const allowedFields = ['name', 'permissions', 'color', 'priority', 'isDefault'];
      const updateFields = {};

      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const role = await Role.findByIdAndUpdate(
        roleId,
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!role) {
        throw new Error('Role not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `role:${roleId}`;
        await redis.del(cacheKey);
      }

      logger.info(`Role updated: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error updating role:', error);
      throw new Error(`Error updating role: ${error.message}`);
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
        throw new Error('Role not found');
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

      logger.info(`Role deleted: ${roleId}`);
      return role;
    } catch (error) {
      logger.error('Error deleting role:', error);
      throw new Error(`Error deleting role: ${error.message}`);
    }
  }
}

module.exports = new RoleService();

