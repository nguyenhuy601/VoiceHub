const friendService = require('../services/friend.service');
const { logger } = require('/shared');

class FriendController {
  // Gửi lời mời kết bạn
  async sendFriendRequest(req, res) {
    try {
      const { friendId } = req.body;
      const userId = req.user?.id || req.userContext?.userId;

      if (!friendId || !userId) {
        return res.status(400).json({
          success: false,
          message: 'friendId and userId are required',
        });
      }

      const friend = await friendService.sendFriendRequest(userId, friendId);

      res.status(201).json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logger.error('Send friend request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Chấp nhận lời mời kết bạn
  async acceptFriendRequest(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const friend = await friendService.acceptFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logger.error('Accept friend request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Từ chối lời mời kết bạn
  async rejectFriendRequest(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const friend = await friendService.rejectFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logger.error('Reject friend request error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách bạn bè
  async getFriends(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId || req.params.userId;
      const { status, page, limit } = req.query;

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }

      const result = await friendService.getFriends(userId, {
        status: status || 'accepted',
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 50,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Get friends error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Lấy danh sách lời mời kết bạn
  async getFriendRequests(req, res) {
    try {
      const userId = req.user?.id || req.userContext?.userId;
      const { type = 'received' } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const requests = await friendService.getFriendRequests(userId, type);

      res.json({
        success: true,
        data: requests,
      });
    } catch (error) {
      logger.error('Get friend requests error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Xóa bạn bè
  async removeFriend(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      await friendService.removeFriend(userId, friendId);

      res.json({
        success: true,
        message: 'Friend removed successfully',
      });
    } catch (error) {
      logger.error('Remove friend error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Chặn user
  async blockUser(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const block = await friendService.blockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logger.error('Block user error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Bỏ chặn user
  async unblockUser(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const block = await friendService.unblockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logger.error('Unblock user error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  // Kiểm tra relationship
  async getRelationship(req, res) {
    try {
      const { friendId } = req.params;
      const userId = req.user?.id || req.userContext?.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const relationship = await friendService.getRelationship(userId, friendId);

      res.json({
        success: true,
        data: relationship,
      });
    } catch (error) {
      logger.error('Get relationship error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
}

module.exports = new FriendController();

