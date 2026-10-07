const friendService = require('../services/friend.service');
const { logger } = require('@enterprise/shared');
const { fetchUserByPhoneInternal } = require('../clients/userService.client');
const { assertFriendWriteAllowed } = require('../utils/friendWriteLimit');
const { sendServiceError } = require('../middleware/sendServiceError');
const { mapFriendError, isExpectedFriendError } = require('../utils/friendErrorMap');
const { pickFriendSearchProfile } = require('../utils/friendSearchProfile');

const SERVICE_UNAVAILABLE_MESSAGE = 'Dịch vụ tạm thời không khả dụng. Vui lòng thử lại sau.';
const USER_NOT_FOUND_MESSAGE = 'Không tìm thấy người dùng';

function logFriendFailure(label, error, extra) {
  if (error?.errorCode === 'FRIEND_RATE_LIMITED') {
    logger.warn(label, extra || error.errorCode);
    return;
  }
  logger.error(label, error);
}

function sendFriendError(res, error, extra) {
  const { status, errorCode, message } = mapFriendError(error);
  if (status >= 500) {
    return sendServiceError(res, status, { errorCode, messageUser: message, extra });
  }
  return sendServiceError(res, status, { errorCode, message, extra });
}

class FriendController {
  // Gửi lời mời kết bạn
  async sendFriendRequest(req, res) {
    try {
      const friendId = req.body?.friendId ?? req.body?.userId;
      const currentUserId = req.user?.id ?? req.user?._id ?? req.userContext?.userId;
      const userId = currentUserId?.toString?.() ?? currentUserId;

      await assertFriendWriteAllowed({ userId, bucket: 'request' });

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
      if (isExpectedFriendError(error)) {
        logger.warn('Send friend request:', error.message);
      } else {
        logger.error('Send friend request error:', error);
      }
      return sendFriendError(res, error);
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

      await assertFriendWriteAllowed({ userId, bucket: 'mutate' });

      const friend = await friendService.acceptFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logFriendFailure('Accept friend request error:', error);
      return sendFriendError(res, error);
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

      await assertFriendWriteAllowed({ userId, bucket: 'mutate' });

      const friend = await friendService.rejectFriendRequest(userId, friendId);

      res.json({
        success: true,
        data: friend,
      });
    } catch (error) {
      logFriendFailure('Reject friend request error:', error);
      return sendFriendError(res, error);
    }
  }

  // Lấy danh sách bạn bè
  async getFriends(req, res) {
    try {
      const authUserId = String(req.user?.id || req.userContext?.userId || '').trim();
      const paramUserId = String(req.params.userId || '').trim();
      const userId = authUserId;
      const { status, page, limit } = req.query;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }
      if (paramUserId && paramUserId !== userId) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
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
      return sendFriendError(res, error);
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
      return sendFriendError(res, error);
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

      await assertFriendWriteAllowed({ userId, bucket: 'mutate' });

      const block = await friendService.blockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logFriendFailure('Block user error:', error);
      return sendFriendError(res, error);
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

      await assertFriendWriteAllowed({ userId, bucket: 'mutate' });

      const block = await friendService.unblockUser(userId, friendId);

      res.json({
        success: true,
        data: block,
      });
    } catch (error) {
      logFriendFailure('Unblock user error:', error);
      return sendFriendError(res, error);
    }
  }

  async searchByPhone(req, res) {
    try {
      const { phone } = req.query;
      if (!phone) {
        return res.status(400).json({ status: 'fail', message: 'Phone parameter is required' });
      }

      const actorId = req.user?.id || req.user?._id || req.userContext?.userId;
      if (!actorId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }
      await assertFriendWriteAllowed({ userId: actorId, bucket: 'search' });

      let response;
      try {
        response = await fetchUserByPhoneInternal(phone);
      } catch (error) {
        if (error?.code === 'NO_INTERNAL_TOKEN') {
          logger.warn('Search friend by phone: user-service internal token missing');
          return sendServiceError(res, 503, {
            errorCode: 'FRIEND_UNAVAILABLE',
            messageUser: SERVICE_UNAVAILABLE_MESSAGE,
            extra: { status: 'fail' },
          });
        }
        if (error.response) {
          if (error.response.status === 404) {
            return sendServiceError(res, 404, {
              errorCode: 'FRIEND_USER_NOT_FOUND',
              message: USER_NOT_FOUND_MESSAGE,
              extra: { status: 'fail' },
            });
          }
          logger.warn('Search friend by phone: user-service responded', error.response.status);
          return sendServiceError(res, 503, {
            errorCode: 'FRIEND_UNAVAILABLE',
            messageUser: SERVICE_UNAVAILABLE_MESSAGE,
            extra: { status: 'fail' },
          });
        }
        throw error;
      }

      const userData = response.data?.data;
      if (!userData) {
        return res.status(404).json({ status: 'fail', message: 'User not found' });
      }

      const relationship = await friendService.getRelationship(actorId, userData.userId || userData._id);

      return res.json({
        status: 'success',
        data: {
          ...pickFriendSearchProfile(userData),
          relationship,
        },
      });
    } catch (error) {
      logFriendFailure('Search friend by phone error:', error, {
        phoneLength: String(req.query?.phone || '').length,
      });
      return sendFriendError(res, error);
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
      return sendFriendError(res, error);
    }
  }
}

module.exports = new FriendController();
