const UserProfile = require('../models/UserProfile');
const { getRedisClient, logger } = require('@enterprise/shared');
const { phoneBlindIndex } = require('@enterprise/shared/utils/fieldCrypto');
const { emailLookupFilter } = require('@enterprise/shared/utils/emailPii');
const {
  writePiiPatch,
  writeEmailPatch,
  writeDateOfBirthFields,
  maybeMigrateProfilePii,
  readPiiFromProfile,
} = require('../utils/profilePii');

function serviceError(message, statusCode = 400, errorCode = 'USER_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

class UserService {
  /**
   * Profile mồ côi: cùng email (emailBlindIndex) nhưng userId auth khác — gán lại userId hiện tại.
   */
  async reclaimProfileByEmail(userId, email, displayName) {
    const uid = String(userId || '').trim();
    const filter = emailLookupFilter(email);
    if (!uid || !filter) return null;

    const byEmail = await UserProfile.findOne(filter);
    if (!byEmail) return null;

    if (String(byEmail.userId) === uid) {
      return byEmail;
    }

    const collision = await UserProfile.findOne({ userId: uid });
    if (collision) {
      return collision;
    }

    const patch = { userId: uid };
    const dn = String(displayName || '').trim();
    if (dn && !String(byEmail.displayName || '').trim()) {
      patch.displayName = dn;
    }

    const reclaimed = await UserProfile.findOneAndUpdate(
      { _id: byEmail._id },
      { $set: patch },
      { new: true }
    );

    const redis = getRedisClient();
    if (redis) {
      await redis.del(`user:${byEmail.userId}`);
      await redis.del(`user:${uid}`);
    }

    logger.warn(
      `Reclaimed profile ${byEmail._id} for email=${String(email).trim().toLowerCase()} userId ${byEmail.userId} -> ${uid}`
    );
    return reclaimed;
  }

  /** Tạo profile tối thiểu nếu chưa có (provision / lazy bootstrap / onboarding). */
  async ensureUserProfile(userId, { email, displayName, username, dateOfBirth } = {}) {
    const uid = String(userId || '').trim();
    if (!uid) return null;

    const existing = await UserProfile.findOne({ userId: uid });
    if (existing) return existing;

    const normalizedEmail = String(email || '')
      .trim()
      .toLowerCase();
    if (!normalizedEmail) return null;

    const reclaimed = await this.reclaimProfileByEmail(uid, normalizedEmail, displayName);
    if (reclaimed) return reclaimed;

    const baseUsername = String(username || '').trim()
      || normalizedEmail.split('@')[0]
      || `user${uid.slice(-6)}`;
    try {
      return await this.createUserProfile({
        userId: uid,
        username: baseUsername,
        email: normalizedEmail,
        displayName: String(displayName || '').trim() || baseUsername,
        dateOfBirth,
      });
    } catch (error) {
      if (Number(error?.code) === 11000) {
        const fallback = await this.reclaimProfileByEmail(uid, normalizedEmail, displayName);
        if (fallback) return fallback;
        return UserProfile.findOne({ userId: uid });
      }
      throw error;
    }
  }

  // Tạo user profile mới
  async createUserProfile(userData) {
    const { userId, username, email, displayName, dateOfBirth } = userData || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    try {
      if (!userId) {
        throw serviceError('Thiếu userId', 400, 'USER_VALIDATION');
      }
      if (!normalizedEmail) {
        throw serviceError('Thiếu email', 400, 'USER_VALIDATION');
      }

      let finalUsername = String(username || '')
        .trim()
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9_]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (finalUsername.length < 3) {
        finalUsername = normalizedEmail.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '') || 'user';
      }
      if (finalUsername.length < 3) {
        finalUsername = `user${String(userId).slice(-6)}`;
      }

      let attempt = 0;
      while (attempt < 6) {
        const existingUser = await UserProfile.findOne({ username: finalUsername });
        if (!existingUser) break;
        attempt += 1;
        const suffix = String(userId).slice(-4);
        finalUsername =
          attempt === 1
            ? `${finalUsername}_${suffix}`
            : `${String(username || 'user').trim().slice(0, 20)}_${suffix}${attempt}`;
      }
      const taken = await UserProfile.findOne({ username: finalUsername });
      if (taken) {
        throw serviceError('Tên người dùng đã tồn tại', 400, 'USER_USERNAME_EXISTS');
      }

      const userProfile = new UserProfile({
        userId,
        username: finalUsername,
        ...writeEmailPatch(normalizedEmail),
        displayName: displayName || finalUsername,
        ...writeDateOfBirthFields(dateOfBirth || null),
      });

      await userProfile.save();

      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        const plain =
          typeof userProfile.toObject === 'function' ? userProfile.toObject() : { ...userProfile };
        const pii = readPiiFromProfile(plain);
        const forCache = { ...plain };
        if (pii.email) forCache.email = pii.email;
        await redis.setex(cacheKey, 3600, JSON.stringify(forCache));
      }

      logger.info(`User profile created: ${userId}`);
      return userProfile;
    } catch (error) {
      if (Number(error?.code) === 11000) {
        const reclaimed = await this.reclaimProfileByEmail(
          userId,
          normalizedEmail,
          displayName
        );
        if (reclaimed) return reclaimed;
      }
      logger.error('Error creating user profile:', error);
      throw error;
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(userId) {
    try {
      // Kiểm tra cache trước
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        const cached = await redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      }

      let userProfile = await UserProfile.findOne({ userId });
      if (userProfile) {
        try {
          await maybeMigrateProfilePii(UserProfile, userProfile);
        } catch (migrateError) {
          logger.warn(
            `Skip profile PII migration for userId=${userId}: ${
              migrateError?.message || 'unknown migration error'
            }`
          );
        }
      }

      // Cache user profile (plaintext PII cho API)
      if (redis && userProfile) {
        const cacheKey = `user:${userId}`;
        const plain =
          typeof userProfile.toObject === 'function' ? userProfile.toObject() : { ...userProfile };
        const pii = readPiiFromProfile(plain);
        // Chỉ ghi đè email plaintext khi decrypt OK — tránh cache email:'' che ciphertext.
        const forCache = { ...plain };
        if (pii.email) forCache.email = pii.email;
        if (pii.bio !== undefined) forCache.bio = pii.bio;
        if (pii.phone) forCache.phone = pii.phone;
        if (pii.location) forCache.location = pii.location;
        if (pii.dateOfBirth != null) forCache.dateOfBirth = pii.dateOfBirth;
        await redis.setex(cacheKey, 3600, JSON.stringify(forCache));
      }

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile:', error);
      throw error;
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(username) {
    try {
      const userProfile = await UserProfile.findOne({ username });

      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by username:', error);
      throw error;
    }
  }

  // Cập nhật user profile
  async updateUserProfile(userId, updateData) {
    try {
      const allowedFields = ['displayName', 'avatar', 'preferences', 'isInvisible', 'status', 'jobTitle'];

      const existingProfile = await UserProfile.findOne({ userId }).lean();

      const updateFields = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          if (field === 'preferences' && updateData.preferences && typeof updateData.preferences === 'object') {
            const prev =
              existingProfile?.preferences && typeof existingProfile.preferences === 'object'
                ? existingProfile.preferences
                : {};
            updateFields.preferences = { ...prev, ...updateData.preferences };
          } else {
            updateFields[field] = updateData[field];
          }
        }
      }

      const prefJob = updateFields.preferences?.jobTitle;
      if (prefJob !== undefined && String(prefJob).trim()) {
        updateFields.jobTitle = String(prefJob).trim();
      }
      if (updateData.jobTitle !== undefined && String(updateData.jobTitle).trim()) {
        updateFields.jobTitle = String(updateData.jobTitle).trim();
        if (updateFields.preferences) {
          updateFields.preferences.jobTitle = updateFields.jobTitle;
        }
      }

      if (updateData.orgNicknames !== undefined && updateData.orgNicknames !== null) {
        const prev =
          existingProfile?.orgNicknames && typeof existingProfile.orgNicknames === 'object'
            ? existingProfile.orgNicknames
            : {};
        const patch =
          typeof updateData.orgNicknames === 'object' ? updateData.orgNicknames : {};
        updateFields.orgNicknames = { ...prev, ...patch };
      }
      const { patch: piiPatch, unset: piiUnset } = writePiiPatch({
        bio: updateData.bio,
        phone: updateData.phone,
        location: updateData.location,
        dateOfBirth: updateData.dateOfBirth,
      });
      Object.assign(updateFields, piiPatch);

      const updateOp = { $set: updateFields };
      if (piiUnset.length > 0) {
        updateOp.$unset = Object.fromEntries(piiUnset.map((field) => [field, '']));
      }

      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        updateOp,
        { new: true, runValidators: true }
      );

      if (!userProfile) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile updated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error updating user profile:', error);
      throw error;
    }
  }

  // Cập nhật status
  async updateStatus(userId, status) {
    try {
      const patch = { status };
      if (status === 'online' || status === 'offline') {
        patch.lastSeen = new Date();
      }
      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: patch },
        { new: true, runValidators: false }
      );
      if (!userProfile) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      return userProfile;
    } catch (error) {
      logger.error('Error updating status:', error);
      throw error;
    }
  }

  // Tìm kiếm users
  async searchUsers(query, options = {}) {
    try {
      const { page = 1, limit = 20 } = options;

      const searchRegex = new RegExp(query, 'i');
      const filter = {
        $or: [
          { username: searchRegex },
          { displayName: searchRegex },
          { phone: searchRegex },
          { email: searchRegex },
        ],
        isActive: true,
      };

      const users = await UserProfile.find(filter)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .select('userId username displayName avatar status email')
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
      throw error;
    }
  }

  // Tìm user profile theo số điện thoại (plaintext hoặc phoneBlindIndex khi PII mã hóa)
  async getUserProfileByPhone(phone) {
    try {
      const normalized = String(phone || '').trim();
      if (!normalized) return null;

      let userProfile = await UserProfile.findOne({ phone: normalized, isActive: true });
      if (!userProfile) {
        const blind = phoneBlindIndex(normalized);
        if (blind) {
          userProfile = await UserProfile.findOne({ phoneBlindIndex: blind, isActive: true });
        }
      }
      return userProfile;
    } catch (error) {
      logger.error('Error getting user profile by phone:', error);
      throw error;
    }
  }

  async updateUserEmailInternal(userId, email) {
    const uid = String(userId || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!uid || !normalizedEmail) {
      throw serviceError('Thiếu userId hoặc email', 400, 'USER_VALIDATION');
    }

    const emailFields = writeEmailPatch(normalizedEmail);
    const dupFilter = emailFields.emailBlindIndex
      ? {
          userId: { $ne: uid },
          $or: [{ emailBlindIndex: emailFields.emailBlindIndex }, { email: normalizedEmail }],
        }
      : { userId: { $ne: uid }, email: normalizedEmail };
    const duplicate = await UserProfile.findOne(dupFilter).select('userId').lean();
    if (duplicate) {
      throw serviceError('Email đã được dùng bởi hồ sơ khác', 409, 'USER_EMAIL_EXISTS');
    }

    const userProfile = await UserProfile.findOneAndUpdate(
      { userId: uid },
      { $set: emailFields },
      { new: true, runValidators: true }
    );
    if (!userProfile) {
      throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
    }
    const redis = getRedisClient();
    if (redis) {
      await redis.del(`user:${uid}`);
    }
    return userProfile;
  }

  // Xóa user profile (soft delete)
  async deleteUserProfile(userId) {
    try {
      const userProfile = await UserProfile.findOneAndUpdate(
        { userId },
        { $set: { isActive: false } },
        { new: true }
      );

      if (!userProfile) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
      }

      // Xóa cache
      const redis = getRedisClient();
      if (redis) {
        const cacheKey = `user:${userId}`;
        await redis.del(cacheKey);
      }

      logger.info(`User profile deactivated: ${userId}`);
      return userProfile;
    } catch (error) {
      logger.error('Error deleting user profile:', error);
      throw error;
    }
  }
}

module.exports = new UserService();

