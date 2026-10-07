const roleService = require('../services/role.service');
const { logger } = require('@enterprise/shared');
const { sendErrorFromCatch, sendServiceError } = require('../middleware/sendServiceError');
const { isValidObjectId } = require('../utils/roleOrgScope');
const {
  validateRoleCreateInput,
  validateRoleUpdateInput,
} = require('../utils/roleInputPolicy');

const sendError = sendErrorFromCatch;

class RoleController {
  // Tạo role mới
  async createRole(req, res) {
    try {
      const {
        scope,
        serverId,
        organizationId,
        isDefault,
        fromTemplateKey,
        permissionGroupId,
        allowBlankLegacy,
      } = req.body;

      const resolvedOrg = req.resolvedOrganizationId || organizationId || serverId;
      if (!resolvedOrg) {
        return sendServiceError(res, 400, {
          errorCode: 'ROLE_ORG_REQUIRED',
          message: 'name, serverId and organizationId are required',
          messageUser: 'name, serverId and organizationId are required',
        });
      }

      const validated = validateRoleCreateInput(req.body);
      if (!validated.ok) {
        return sendServiceError(res, 400, {
          errorCode: validated.errorCode,
          message: validated.message,
          messageUser: validated.message,
        });
      }

      const role = await roleService.createRole({
        ...validated.value,
        scope: validated.value.scope ?? scope,
        serverId: resolvedOrg,
        organizationId: resolvedOrg,
        isDefault,
        fromTemplateKey,
        permissionGroupId,
        allowBlankLegacy,
        isInternal: Boolean(req.isInternalServiceCall),
      });

      res.status(201).json({
        success: true,
        data: role,
      });
    } catch (error) {
      const isDuplicate =
        String(error?.errorCode || '') === 'ROLE_NAME_EXISTS' ||
        String(error?.message || '').includes('đã tồn tại');
      if (isDuplicate) {
        logger.warn('Create role skipped (duplicate name):', error.message);
      } else {
        logger.error('Create role error:', error);
      }
      return sendError(res, error, 400, 'Không thể tạo vai trò', 'ROLE_CREATE_FAILED');
    }
  }

  // Lấy role theo ID
  async getRoleById(req, res) {
    try {
      const { roleId } = req.params;
      const organizationId = req.resolvedOrganizationId;
      const role = await roleService.getRoleById(roleId, organizationId);

      if (!role) {
        return sendError(
          res,
          Object.assign(new Error('Role not found'), {
            statusCode: 404,
            errorCode: 'ROLE_NOT_FOUND',
          }),
          404,
          'Role not found',
          'ROLE_NOT_FOUND'
        );
      }

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Get role error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò', 'ROLE_GET_FAILED');
    }
  }

  // Lấy danh sách roles trong server
  async getRolesByServer(req, res) {
    try {
      const { serverId } = req.params;
      const roles = await roleService.getRolesByServer(serverId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      logger.error('Get roles error:', error);
      return sendError(res, error, 500, 'Không thể tải danh sách vai trò', 'ROLE_LIST_FAILED');
    }
  }

  // Gán role cho user
  async assignRoleToUser(req, res) {
    try {
      const { userId, roleId } = req.body;
      const serverId = req.resolvedOrganizationId || req.body?.serverId;
      const assignedBy = req.user?.id || req.userContext?.userId;

      if (!userId || !serverId || !roleId) {
        return sendServiceError(res, 400, {
          errorCode: 'ROLE_VALIDATION_ERROR',
          message: 'userId, serverId and roleId are required',
          messageUser: 'userId, serverId and roleId are required',
        });
      }
      if (![userId, serverId, roleId].every(isValidObjectId)) {
        return sendServiceError(res, 400, {
          errorCode: 'ROLE_VALIDATION_ERROR',
          message: 'Invalid id',
          messageUser: 'Invalid id',
        });
      }

      const userRole = await roleService.assignRoleToUser(userId, serverId, roleId, assignedBy);

      res.status(201).json({
        success: true,
        data: userRole,
      });
    } catch (error) {
      logger.error('Assign role error:', error);
      return sendError(res, error, 400, 'Không thể gán vai trò', 'ROLE_ASSIGN_FAILED');
    }
  }

  // Xóa role khỏi user
  async removeRoleFromUser(req, res) {
    try {
      const { userId, roleId } = req.body;
      const serverId = req.resolvedOrganizationId || req.body?.serverId;

      if (!userId || !serverId || !roleId) {
        return sendServiceError(res, 400, {
          errorCode: 'ROLE_VALIDATION_ERROR',
          message: 'userId, serverId and roleId are required',
          messageUser: 'userId, serverId and roleId are required',
        });
      }
      if (![userId, serverId, roleId].every(isValidObjectId)) {
        return sendServiceError(res, 400, {
          errorCode: 'ROLE_VALIDATION_ERROR',
          message: 'Invalid id',
          messageUser: 'Invalid id',
        });
      }

      const userRole = await roleService.removeRoleFromUser(userId, serverId, roleId);

      res.json({
        success: true,
        data: userRole,
      });
    } catch (error) {
      logger.error('Remove role error:', error);
      return sendError(res, error, 400, 'Không thể gỡ vai trò', 'ROLE_REMOVE_FAILED');
    }
  }

  // Lấy roles của user trong server
  async getUserRoles(req, res) {
    try {
      const { userId, serverId } = req.params;
      const roles = await roleService.getUserRoles(userId, serverId);

      res.json({
        success: true,
        data: roles,
      });
    } catch (error) {
      logger.error('Get user roles error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò người dùng', 'ROLE_USER_LIST_FAILED');
    }
  }

  // Cập nhật role
  async updateRole(req, res) {
    try {
      const { roleId } = req.params;
      const organizationId = req.resolvedOrganizationId;
      const validated = validateRoleUpdateInput(req.body || {});
      if (!validated.ok) {
        return sendServiceError(res, 400, {
          errorCode: validated.errorCode,
          message: validated.message,
          messageUser: validated.message,
        });
      }
      const role = await roleService.updateRole(roleId, organizationId, validated.value, {
        isInternal: Boolean(req.isInternalServiceCall),
      });

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Update role error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật vai trò', 'ROLE_UPDATE_FAILED');
    }
  }

  // Xóa role
  async deleteRole(req, res) {
    try {
      const { roleId } = req.params;
      const organizationId = req.resolvedOrganizationId;
      const role = await roleService.deleteRole(roleId, organizationId, {
        isInternal: Boolean(req.isInternalServiceCall),
      });

      res.json({
        success: true,
        message: 'Role deleted successfully',
        data: role,
      });
    } catch (error) {
      logger.error('Delete role error:', error);
      return sendError(res, error, 400, 'Không thể xóa vai trò', 'ROLE_DELETE_FAILED');
    }
  }

  async purgeByServerContext(req, res) {
    try {
      const { serverId } = req.params;
      const data = await roleService.purgeByServerContext(serverId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('purgeByServerContext error:', error);
      return sendError(res, error, 400, 'Không thể dọn dữ liệu vai trò', 'ROLE_PURGE_FAILED');
    }
  }

  async backfillRoleRead(req, res) {
    try {
      const serverId = req.params?.serverId || req.body?.serverId || req.body?.organizationId || null;
      const data = await roleService.backfillRoleReadPermission(serverId);
      res.json({ success: true, data });
    } catch (error) {
      logger.error('backfillRoleRead error:', error);
      return sendError(res, error, 500, 'Không thể backfill quyền role:read', 'ROLE_BACKFILL_FAILED');
    }
  }

  async listAssignmentsByServer(req, res) {
    try {
      const { serverId } = req.params;
      const byUser = await roleService.listAssignmentsByServer(serverId);
      res.json({ success: true, data: { byUser } });
    } catch (error) {
      logger.error('listAssignmentsByServer error:', error);
      return sendError(res, error, 400, 'Không thể tải assignment vai trò', 'ROLE_ASSIGNMENTS_LIST_FAILED');
    }
  }
}

module.exports = new RoleController();

