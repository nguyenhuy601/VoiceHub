const permissionService = require('../services/permission.service');
const { logger } = require('@enterprise/shared');
const { sendErrorFromCatch } = require('../middleware/sendServiceError');

const sendError = sendErrorFromCatch;

class PermissionController {
  // Kiểm tra quyền truy cập (cho API Gateway)
  async checkPermission(req, res) {
    try {
      const { userId, serverId, action } = req.body;

      if (!userId || !serverId || !action) {
        return res.status(400).json({
          success: false,
          message: 'userId, serverId and action are required',
        });
      }

      const result = await permissionService.checkPermission(userId, serverId, action);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Check permission error:', error);
      return sendError(res, error, 500, 'Không thể kiểm tra quyền truy cập', 'PERMISSION_CHECK_FAILED');
    }
  }

  // Lấy permissions của user trong server
  async getUserPermissions(req, res) {
    try {
      const { userId, serverId } = req.params;
      const result = await permissionService.getUserPermissions(userId, serverId);
      const permissions = Array.isArray(result) ? result : result?.permissions || [];
      const masterGrants = Array.isArray(result) ? [] : result?.masterGrants || [];

      res.json({
        success: true,
        data: permissions,
        masterGrants,
      });
    } catch (error) {
      logger.error('Get user permissions error:', error);
      return sendError(res, error, 500, 'Không thể tải quyền người dùng', 'PERMISSION_GET_FAILED');
    }
  }

  // Lấy role của user trong server (cho API Gateway)
  async getUserRole(req, res) {
    try {
      const { userId, serverId } = req.params;
      const role = await permissionService.getUserRole(userId, serverId);

      res.json({
        success: true,
        data: role,
      });
    } catch (error) {
      logger.error('Get user role error:', error);
      return sendError(res, error, 500, 'Không thể tải vai trò người dùng', 'PERMISSION_ROLE_FAILED');
    }
  }
}

module.exports = new PermissionController();

