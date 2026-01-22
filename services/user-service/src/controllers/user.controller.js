const userService = require('../services/user.service');
const { logger } = require('/shared');

class UserController {
  // Tạo user profile mới
  async createUserProfile(req, res) {
    try {
      const { userId, username, displayName, dateOfBirth } = req.body;

      if (!userId || !username) {
        return res.status(400).json({
          success: false,
          message: 'userId and username are required',
        });
      }

      const userProfile = await userService.createUserProfile({
        userId,
        username,
        displayName,
        dateOfBirth,
      });

      res.status(201).json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Create user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(req, res) {
    try {
      const { userId } = req.params;
      const userProfile = await userService.getUserProfileById(userId);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get user profile error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(req, res) {
    try {
      const { username } = req.params;
      const userProfile = await userService.getUserProfileByUsername(username);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get user profile by username error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy thông tin user hiện tại
  async getCurrentUser(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const userProfile = await userService.getUserProfileById(userId);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật user profile
  async updateUserProfile(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.params.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const userProfile = await userService.updateUserProfile(userId, req.body);

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Update user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Cập nhật status
  async updateStatus(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { status } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      if (!status || !['online', 'offline', 'away', 'busy'].includes(status)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid status',
        });
      }

      const userProfile = await userService.updateStatus(userId, status);

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      logger.error('Update status error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Tìm kiếm users
  async searchUsers(req, res) {
    try {
      const { q, page, limit } = req.query;

      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const result = await userService.searchUsers(q, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Search users error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa user profile
  async deleteUserProfile(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = req.user?.id || req.userContext?.userId;

      // Chỉ cho phép xóa chính mình hoặc admin
      if (userId !== currentUserId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }

      const userProfile = await userService.deleteUserProfile(userId);

      res.json({
        success: true,
        message: 'User profile deleted successfully',
        data: userProfile,
      });
    } catch (error) {
      logger.error('Delete user profile error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new UserController();

