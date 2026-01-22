const permissionService = require('../services/permission.service');
const { logger } = require('/shared');

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
      res.status(500).json({
        success: false,
        message: error.message,
        data: {
          allowed: false,
          reason: 'Permission check failed',
        },
      });
    }
  }

  // Lấy permissions của user trong server
  async getUserPermissions(req, res) {
    try {
      const { userId, serverId } = req.params;
      const permissions = await permissionService.getUserPermissions(userId, serverId);

      res.json({
        success: true,
        data: permissions,
      });
    } catch (error) {
      logger.error('Get user permissions error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
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
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new PermissionController();

