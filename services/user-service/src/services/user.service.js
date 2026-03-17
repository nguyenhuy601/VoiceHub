const mongoose = require('mongoose');
const UserProfile = require('../models/UserProfile');
const { getRedisClient, logger } = require('/shared');

class UserService {
  // Tạo user profile mới (idempotent theo userId / email: gọi lại cùng user thì trả về profile có sẵn)
  async createUserProfile(userData) {
    try {
      const { userId, username, email, displayName, dateOfBirth } = userData;

      if (!email || typeof email !== 'string' || !email.trim()) {
        throw new Error('email is required');
      }

      const normalizedEmail = email.trim().toLowerCase();
      const normalizedUsername = username ? String(username).trim() : '';
      if (!normalizedUsername || normalizedUsername.length < 3) {
        throw new Error('username is required and must be at least 3 characters');
      }
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

      // Đã có profile cho userId này → coi như thành công, trả về luôn (idempotent)
      const existingByUserId = await UserProfile.findOne({ userId: userIdObj });
      if (existingByUserId) {
        logger.info(`User profile already exists for userId: ${userId}, returning existing`);
        return existingByUserId;
      }

      // Kiểm tra email chỉ khi có giá trị; nếu đã có profile cùng email cùng userId → trả về (idempotent)
      const existingByEmail = await UserProfile.findOne({ email: normalizedEmail });
      if (existingByEmail) {
        const existingUserIdStr = existingByEmail.userId?.toString?.() || existingByEmail.userId;
        if (existingUserIdStr === userId.toString()) {
          logger.info(`User profile already exists for email (same userId): ${normalizedEmail}, returning existing`);
          return existingByEmail;
        }
        logger.warn(`Email already exists: existing userId=${existingUserIdStr}, request userId=${userId}`);
        throw new Error('Email already exists');
      }

      const userProfile = new UserProfile({
        userId: userIdObj,
        username: normalizedUsername,
        email: normalizedEmail,
        displayName: (displayName && String(displayName).trim()) || normalizedUsername,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      });

      await userProfile.save();

      // Cache user profile trong Redis
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(userProfile));
      }

      logger.info(`User profile created: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw new Error(`Error creating user profile: ${error.message}`);
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(userId) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          try {
            return JSON.parse(cached);
          } catch (e) {
            await redis.del(cacheKey).catch(() => {});
          }
        }
      }

      const userProfile = await UserProfile.findOne({ userId: userIdObj });

      // Cache user profile
      if (redis && userProfile) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(userProfile));
      }

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw new Error(`Error getting user profile: ${error.message}`);
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(username) {
    try {
      const normalized = username ? String(username).trim() : '';
      if (!normalized) return null;
      const userProfile = await UserProfile.findOne({ username: normalized });

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by username:', error);
      throw new Error(`Error getting user profile: ${error.message}`);
    }
  }

  // Cập nhật user profile
  async updateUserProfile(userId, updateData) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const allowedFields = [
        'displayName',
        'avatar',
        'bio',
        'phone',
        'dateOfBirth',
        'location',
        'preferences',
      ];

      const updateFields = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      const userProfile = await UserProfile.findOneAndUpdate(
        { userId: userIdObj },
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!userProfile) {
        throw new Error('User profile not found');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile updated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw new Error(`Error updating user profile: ${error.message}`);
    }
  }

  // Cập nhật status
  async updateStatus(userId, status) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const userProfile = await UserProfile.findOne({ userId: userIdObj });
      if (!userProfile) {
        throw new Error('User profile not found');
      }

      await userProfile.updateStatus(status);

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.del(cacheKey);
      }

      return userProfile;
    } catch (error) {
      logger.error('Error updating status:', error);
      throw new Error(`Error updating status: ${error.message}`);
    }
  }

  // Tìm kiếm users
  async searchUsers(query, options = {}) {
    try {
      const page = Math.max(1, parseInt(options.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 20));
      const sanitized = String(query || '').trim().slice(0, 100);
      if (!sanitized) {
        return { users: [], totalPages: 0, currentPage: page, total: 0 };
      }
      const escaped = sanitized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escaped, 'i');
      const filter = {
        $or: [
          { username: searchRegex },
          { displayName: searchRegex },
          { phone: searchRegex },
        ],
        isActive: true,
      };

      const users = await UserProfile.find(filter)
        .limit(limit)
        .skip((page - 1) * limit)
        .select('userId username displayName avatar status')
        .sort({ username: 1 });

      const total = await UserProfile.countDocuments(filter);

      return {
        users,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
        total,
      };
    } catch (error) {
      logger.error('Error searching users:', error);
      throw new Error(`Error searching users: ${error.message}`);
    }
  }

  // Tìm user profile theo số điện thoại
  async getUserProfileByPhone(phone) {
    try {
      const normalized = phone ? String(phone).trim() : '';
      if (!normalized) return null;
      const userProfile = await UserProfile.findOne({ phone: normalized, isActive: true });
      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by phone:', error);
      throw new Error(`Error getting user profile by phone: ${error.message}`);
    }
  }

  // Xóa user profile (soft delete)
  async deleteUserProfile(userId) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const userProfile = await UserProfile.findOneAndUpdate(
        { userId: userIdObj },
        { $set: { isActive: false } },
        { new: true }
      );

      if (!userProfile) {
        throw new Error('User profile not found');
      }

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile deactivated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      throw new Error(`Error deleting user profile: ${error.message}`);
    }
  }
}

module.exports = new UserService();

