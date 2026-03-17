const userService = require('../services/user.service');
const { logger } = require('/shared');

/**
 * Middleware để gắn user context vào request
 * Lấy user profile từ userId trong header hoặc token
 */
const userContext = async (req, res, next) => {
  try {
    // Lấy userId từ header (từ API Gateway)
    const userId = req.headers['x-user-id'] || req.user?.id;

    if (userId) {
      try {
        // Lấy user profile và gắn vào request
        const userProfile = await userService.getUserProfileById(userId);
        
        if (userProfile) {
          const plain = typeof userProfile.toObject === 'function' ? userProfile.toObject() : userProfile;
          req.userContext = {
            userId: plain.userId,
            username: plain.username,
            displayName: plain.displayName,
            avatar: plain.avatar,
            status: plain.status,
            ...plain,
          };
        }
      } catch (error) {
        // Nếu không tìm thấy user profile, log warning nhưng không block request
        logger.warn(`User profile not found for userId: ${userId}`);
      }
    }

    next();
  } catch (error) {
    logger.error('User context middleware error:', error);
    // Không block request nếu có lỗi
    next();
  }
};

module.exports = userContext;

