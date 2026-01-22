const Friend = require('../models/Friend');
const { getRedisClient, friendWebhook, logger } = require('/shared');
const axios = require('axios');

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://user-service:3004';

class FriendService {
  // Gửi lời mời kết bạn
  async sendFriendRequest(userId, friendId) {
    try {
      // Kiểm tra user và friend có tồn tại không
      try {
        await Promise.all([
          axios.get(`${USER_SERVICE_URL}/api/users/${userId}`),
          axios.get(`${USER_SERVICE_URL}/api/users/${friendId}`),
        ]);
      } catch (error) {
        throw new Error('User not found');
      }

      // Kiểm tra đã có relationship chưa
      const existing = await Friend.findOne({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      });

      if (existing) {
        if (existing.status === 'accepted') {
          throw new Error('Already friends');
        }
        if (existing.status === 'blocked') {
          throw new Error('Cannot send friend request to blocked user');
        }
        if (existing.status === 'pending' && existing.requestedBy.toString() === userId.toString()) {
          throw new Error('Friend request already sent');
        }
      }

      // Tạo friend request
      const friend = new Friend({
        userId,
        friendId,
        status: 'pending',
        requestedBy: userId,
      });

      await friend.save();

      logger.info(`Friend request sent: ${userId} -> ${friendId}`);
      return friend;
    } catch (error) {
      logger.error('Error sending friend request:', error);
      throw new Error(`Error sending friend request: ${error.message}`);
    }
  }

  // Chấp nhận lời mời kết bạn
  async acceptFriendRequest(userId, friendId) {
    try {
      const friend = await Friend.findOne({
        userId: friendId,
        friendId: userId,
        status: 'pending',
      });

      if (!friend) {
        throw new Error('Friend request not found');
      }

      friend.status = 'accepted';
      friend.acceptedAt = new Date();
      await friend.save();

      // Tạo reverse relationship
      const reverseFriend = await Friend.findOne({
        userId,
        friendId,
      });

      if (!reverseFriend) {
        const newFriend = new Friend({
          userId,
          friendId,
          status: 'accepted',
          requestedBy: friend.requestedBy,
          acceptedAt: new Date(),
        });
        await newFriend.save();
      } else {
        reverseFriend.status = 'accepted';
        reverseFriend.acceptedAt = new Date();
        await reverseFriend.save();
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
        await redis.del(`friends:${friendId}`);
      }

      // Gửi webhook
      try {
        const userResponse = await axios.get(`${USER_SERVICE_URL}/api/users/${friendId}`);
        const friendName = userResponse.data?.data?.displayName || userResponse.data?.data?.username || 'Someone';
        await friendWebhook.requestAccepted(userId, friendId, friendName);
      } catch (error) {
        logger.error('Error sending friend accepted webhook:', error);
      }

      logger.info(`Friend request accepted: ${userId} <-> ${friendId}`);
      return friend;
    } catch (error) {
      logger.error('Error accepting friend request:', error);
      throw new Error(`Error accepting friend request: ${error.message}`);
    }
  }

  // Từ chối/ Hủy lời mời kết bạn
  async rejectFriendRequest(userId, friendId) {
    try {
      const friend = await Friend.findOneAndDelete({
        $or: [
          { userId: friendId, friendId: userId, status: 'pending' },
          { userId, friendId, status: 'pending' },
        ],
      });

      if (!friend) {
        throw new Error('Friend request not found');
      }

      logger.info(`Friend request rejected: ${userId} <-> ${friendId}`);
      return friend;
    } catch (error) {
      logger.error('Error rejecting friend request:', error);
      throw new Error(`Error rejecting friend request: ${error.message}`);
    }
  }

  // Chặn user
  async blockUser(userId, friendId) {
    try {
      // Xóa relationship hiện tại
      await Friend.deleteMany({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      });

      // Tạo block relationship
      const block = new Friend({
        userId,
        friendId,
        status: 'blocked',
        requestedBy: userId,
      });

      await block.save();

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
      }

      logger.info(`User blocked: ${userId} blocked ${friendId}`);
      return block;
    } catch (error) {
      logger.error('Error blocking user:', error);
      throw new Error(`Error blocking user: ${error.message}`);
    }
  }

  // Bỏ chặn user
  async unblockUser(userId, friendId) {
    try {
      const block = await Friend.findOneAndDelete({
        userId,
        friendId,
        status: 'blocked',
      });

      if (!block) {
        throw new Error('Block relationship not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
      }

      logger.info(`User unblocked: ${userId} unblocked ${friendId}`);
      return block;
    } catch (error) {
      logger.error('Error unblocking user:', error);
      throw new Error(`Error unblocking user: ${error.message}`);
    }
  }

  // Lấy danh sách bạn bè
  async getFriends(userId, options = {}) {
    try {
      // Kiểm tra cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `friends:${userId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      const { status = 'accepted', page = 1, limit = 50 } = options;

      const friends = await Friend.find({
        userId,
        status,
      })
        .populate('friendId', 'username displayName avatar status')
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .sort({ acceptedAt: -1, createdAt: -1 });

      const total = await Friend.countDocuments({ userId, status });

      const result = {
        friends: friends.map((f) => ({
          friendId: f.friendId,
          acceptedAt: f.acceptedAt,
          createdAt: f.createdAt,
        })),
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };

      // Cache result
      if (redis) {
        const cacheKey = `friends:${userId}`;
        await redis.setex(cacheKey, 300, JSON.stringify(result)); // 5 minutes
      }

      return result;
    } catch (error) {
      logger.error('Error getting friends:', error);
      throw new Error(`Error getting friends: ${error.message}`);
    }
  }

  // Lấy danh sách lời mời kết bạn
  async getFriendRequests(userId, type = 'received') {
    try {
      const query =
        type === 'sent'
          ? { userId, status: 'pending', requestedBy: userId }
          : { friendId: userId, status: 'pending', requestedBy: { $ne: userId } };

      const requests = await Friend.find(query)
        .populate(type === 'sent' ? 'friendId' : 'userId', 'username displayName avatar')
        .sort({ createdAt: -1 });

      return requests;
    } catch (error) {
      logger.error('Error getting friend requests:', error);
      throw new Error(`Error getting friend requests: ${error.message}`);
    }
  }

  // Xóa bạn bè
  async removeFriend(userId, friendId) {
    try {
      const result = await Friend.deleteMany({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
        status: 'accepted',
      });

      if (result.deletedCount === 0) {
        throw new Error('Friend relationship not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        await redis.del(`friends:${userId}`);
        await redis.del(`friends:${friendId}`);
      }

      logger.info(`Friend removed: ${userId} <-> ${friendId}`);
      return result;
    } catch (error) {
      logger.error('Error removing friend:', error);
      throw new Error(`Error removing friend: ${error.message}`);
    }
  }

  // Kiểm tra relationship
  async getRelationship(userId, friendId) {
    try {
      const friend = await Friend.findOne({
        $or: [
          { userId, friendId },
          { userId: friendId, friendId: userId },
        ],
      });

      if (!friend) {
        return { status: 'none' };
      }

      return {
        status: friend.status,
        requestedBy: friend.requestedBy,
        acceptedAt: friend.acceptedAt,
      };
    } catch (error) {
      logger.error('Error getting relationship:', error);
      throw new Error(`Error getting relationship: ${error.message}`);
    }
  }
}

module.exports = new FriendService();

