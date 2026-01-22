const serverService = require('../services/server.service');
const { logger } = require('/shared');

class ServerController {
  // Tạo server mới
  async createServer(req, res) {
    try {
      const { name, description, organizationId, icon, isPublic } = req.body;
      const ownerId = req.user?.id || req.userContext?.userId;

      if (!name || !organizationId || !ownerId) {
        return res.status(400).json({
          success: false,
          message: 'name, organizationId and ownerId are required',
        });
      }

      const server = await serverService.createServer({
        name,
        description,
        organizationId,
        ownerId,
        icon,
        isPublic,
      });

      res.status(201).json({
        success: true,
        data: server,
      });
    } catch (error) {
      logger.error('Create server error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy server theo ID
  async getServerById(req, res) {
    try {
      const { serverId } = req.params;
      const server = await serverService.getServerById(serverId);

      if (!server) {
        return res.status(404).json({
          success: false,
          message: 'Server not found',
        });
      }

      res.json({
        success: true,
        data: server,
      });
    } catch (error) {
      logger.error('Get server error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách servers trong organization
  async getServersByOrganization(req, res) {
    try {
      const { organizationId } = req.params;
      const { page, limit } = req.query;

      const result = await serverService.getServersByOrganization(organizationId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get servers error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Thêm member vào server
  async addMember(req, res) {
    try {
      const { serverId } = req.params;
      const { userId, role } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const server = await serverService.addMember(serverId, userId, role || 'member');

      res.json({
        success: true,
        data: server,
      });
    } catch (error) {
      logger.error('Add member error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa member khỏi server
  async removeMember(req, res) {
    try {
      const { serverId, userId } = req.params;

      const server = await serverService.removeMember(serverId, userId);

      res.json({
        success: true,
        data: server,
      });
    } catch (error) {
      logger.error('Remove member error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật server
  async updateServer(req, res) {
    try {
      const { serverId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const server = await serverService.updateServer(serverId, req.body, userId);

      res.json({
        success: true,
        data: server,
      });
    } catch (error) {
      logger.error('Update server error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa server
  async deleteServer(req, res) {
    try {
      const { serverId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const server = await serverService.deleteServer(serverId, userId);

      res.json({
        success: true,
        message: 'Server deleted successfully',
        data: server,
      });
    } catch (error) {
      logger.error('Delete server error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new ServerController();

