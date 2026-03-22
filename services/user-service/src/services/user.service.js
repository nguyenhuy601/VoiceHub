const mongoose = require('mongoose');
const UserProfile = require('../models/UserProfile');
const {
  getRedisClient,
  logger,
  encryptField,
  isEncrypted,
  isEncryptionEnabled,
  phoneBlindIndex,
  unwrapPlaintext,
  recordLazyMigrate,
} = require('/shared');

function normalizePhone(phone) {
  if (phone === undefined || phone === null) return null;
  const raw = String(phone).trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  return raw.startsWith('+') ? `+${digits}` : digits;
}

function toPlainObject(doc) {
  if (!doc) return null;
  return doc.toObject ? doc.toObject() : { ...doc };
}

/** Trả về bản plaintext cho API; không lộ phoneBlindIndex / ciphertext */
function toClientProfile(doc) {
  if (!doc) return null;
  const o = toPlainObject(doc);
  delete o.phoneBlindIndex;
  o.phone = unwrapPlaintext(o.phone);
  o.bio = unwrapPlaintext(o.bio);
  if (o.location) o.location = unwrapPlaintext(o.location);
  return o;
}

async function maybeMigrateProfilePII(doc) {
  if (!doc || !isEncryptionEnabled()) return;
  const updates = {};

  if (doc.phone && !isEncrypted(doc.phone)) {
    const n = normalizePhone(doc.phone);
    if (n) {
      updates.phone = encryptField(n);
      updates.phoneBlindIndex = phoneBlindIndex(n);
      updates.encV = 1;
      recordLazyMigrate();
    }
  }

  if (doc.bio && String(doc.bio).length > 0 && !isEncrypted(doc.bio)) {
    updates.bio = encryptField(String(doc.bio));
    updates.encV = 1;
    recordLazyMigrate();
  }

  if (doc.location && String(doc.location).length > 0 && !isEncrypted(doc.location)) {
    updates.location = encryptField(String(doc.location));
    updates.encV = 1;
    recordLazyMigrate();
  }

  if (Object.keys(updates).length > 0) {
    await UserProfile.updateOne({ _id: doc._id }, { $set: updates });
    Object.assign(doc, updates);
  }
}

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

      const existingByUserId = await UserProfile.findOne({ userId: userIdObj });
      if (existingByUserId) {
        logger.info(`User profile already exists for userId: ${userId}, returning existing`);
        await maybeMigrateProfilePII(existingByUserId);
        return toClientProfile(existingByUserId);
      }

      const existingByEmail = await UserProfile.findOne({ email: normalizedEmail });
      if (existingByEmail) {
        const existingUserIdStr = existingByEmail.userId?.toString?.() || existingByEmail.userId;
        if (existingUserIdStr === userId.toString()) {
          logger.info(`User profile already exists for email (same userId): ${normalizedEmail}, returning existing`);
          await maybeMigrateProfilePII(existingByEmail);
          return toClientProfile(existingByEmail);
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

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        const client = toClientProfile(userProfile);
        await redis.setex(cacheKey, 3600, JSON.stringify(client));
      }

      logger.info(`User profile created: ${userId}`);
      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error creating user profile:', error);
      throw new Error(`Error creating user profile: ${error.message}`);
    }
  }

  async getUserProfileById(userId) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

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
      if (userProfile) {
        await maybeMigrateProfilePII(userProfile);
      }

      const client = toClientProfile(userProfile);

      if (redis && client) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.setex(cacheKey, 3600, JSON.stringify(client));
      }

      return client;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw new Error(`Error getting user profile: ${error.message}`);
    }
  }

  async getUserProfileByUsername(username) {
    try {
      const normalized = username ? String(username).trim() : '';
      if (!normalized) return null;
      const userProfile = await UserProfile.findOne({ username: normalized });
      if (userProfile) await maybeMigrateProfilePII(userProfile);
      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error getting user profile by username:', error);
      throw new Error(`Error getting user profile by username: ${error.message}`);
    }
  }

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

      if (Object.prototype.hasOwnProperty.call(updateFields, 'phone')) {
        const normalizedPhone = normalizePhone(updateFields.phone);
        updateFields.phone = normalizedPhone;

        if (normalizedPhone) {
          const blind = phoneBlindIndex(normalizedPhone);
          const existingPhoneOwner = await UserProfile.findOne({
            isActive: true,
            userId: { $ne: userIdObj },
            $or: [{ phoneBlindIndex: blind }, { phone: normalizedPhone }],
          }).select('_id userId');

          if (existingPhoneOwner) {
            const conflictError = new Error('Số điện thoại đã được sử dụng');
            conflictError.statusCode = 409;
            throw conflictError;
          }

          if (isEncryptionEnabled()) {
            updateFields.phone = encryptField(normalizedPhone);
            updateFields.phoneBlindIndex = blind;
            updateFields.encV = 1;
          } else {
            updateFields.phoneBlindIndex = blind;
          }
        } else {
          updateFields.phone = null;
          updateFields.phoneBlindIndex = null;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updateFields, 'bio') && isEncryptionEnabled()) {
        updateFields.bio = encryptField(String(updateFields.bio ?? ''));
        updateFields.encV = 1;
      }

      if (Object.prototype.hasOwnProperty.call(updateFields, 'location') && updateFields.location && isEncryptionEnabled()) {
        updateFields.location = encryptField(String(updateFields.location));
        updateFields.encV = 1;
      }

      const userProfile = await UserProfile.findOneAndUpdate(
        { userId: userIdObj },
        { $set: updateFields },
        { new: true, runValidators: true }
      );

      if (!userProfile) {
        throw new Error('User profile not found');
      }

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile updated: ${userId}`);
      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw new Error(`Error updating user profile: ${error.message}`);
    }
  }

  async updateStatus(userId, status) {
    try {
      const userIdObj = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      const userProfile = await UserProfile.findOne({ userId: userIdObj });
      if (!userProfile) {
        throw new Error('User profile not found');
      }

      await userProfile.updateStatus(status);

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userIdObj.toString()}`;
        await redis.del(cacheKey);
      }

      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error updating status:', error);
      throw new Error(`Error updating status: ${error.message}`);
    }
  }

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
        isActive: true,
        $or: [{ username: searchRegex }, { displayName: searchRegex }],
      };

      const np = normalizePhone(sanitized);
      if (np && np.replace(/\D/g, '').length >= 8) {
        filter.$or.push({ phoneBlindIndex: phoneBlindIndex(np) });
        filter.$or.push({ phone: searchRegex });
      }

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

  async getUserProfileByPhone(phone) {
    try {
      const normalized = normalizePhone(phone);
      if (!normalized) return null;
      const blind = phoneBlindIndex(normalized);
      let userProfile = await UserProfile.findOne({ phoneBlindIndex: blind, isActive: true });
      if (!userProfile) {
        userProfile = await UserProfile.findOne({ phone: normalized, isActive: true });
      }
      if (userProfile) await maybeMigrateProfilePII(userProfile);
      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error getting user profile by phone:', error);
      throw new Error(`Error getting user profile by phone: ${error.message}`);
    }
  }

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
      return toClientProfile(userProfile);
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      throw new Error(`Error deleting user profile: ${error.message}`);
    }
  }
}

module.exports = new UserService();
