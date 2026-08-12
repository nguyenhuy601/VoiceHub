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
const {
  applyCapabilityAction,
  resolveCapabilityIntent,
  resolveResourceConfigIntent,
  emptyCapability,
  mergeClosedBoardExperience,
} = require('./capabilityProfile.service');
const { parseCvFileToFields } = require('./cvParse.service');
const path = require('path');
const fs = require('fs');

function serviceError(message, statusCode = 400, errorCode = 'USER_VALIDATION') {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.errorCode = errorCode;
  return err;
}

/** Position SoT — Admin Position / first-login ghi preferences.jobTitle (alias top-level jobTitle). */
function resolveJobTitle(profile) {
  if (!profile || typeof profile !== 'object') return '';
  return String(profile.preferences?.jobTitle || profile.jobTitle || '').trim();
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
      if (userProfile.employeeCode == null) {
        userProfile.employeeCode = undefined;
        userProfile.set('employeeCode', undefined);
      }

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
  // options.capabilityMode: 'self' (PATCH /me) | 'admin' (PATCH /admin/:id)
  async updateUserProfile(userId, updateData, options = {}) {
    try {
      const allowedFields = ['displayName', 'avatar', 'isInvisible', 'status'];
      const capabilityMode = options.capabilityMode === 'admin' ? 'admin' : 'self';
      const actorUserId = options.actorUserId != null ? String(options.actorUserId) : null;

      const existingProfile = await UserProfile.findOne({ userId }).lean();

      const updateFields = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          updateFields[field] = updateData[field];
        }
      }

      // Merge preferences — không ghi đè mất theme/language khi chỉ PATCH jobTitle.
      // Alias: body.jobTitle (Admin Position) → preferences.jobTitle (SoT Position).
      const hasPrefsPatch =
        (updateData.preferences !== undefined && updateData.preferences !== null) ||
        updateData.jobTitle !== undefined;
      if (hasPrefsPatch) {
        const prev =
          existingProfile?.preferences && typeof existingProfile.preferences === 'object'
            ? existingProfile.preferences
            : {};
        const patch =
          typeof updateData.preferences === 'object' &&
          updateData.preferences !== null &&
          !Array.isArray(updateData.preferences)
            ? updateData.preferences
            : {};
        const next = { ...prev, ...patch };
        if (updateData.jobTitle !== undefined) {
          next.jobTitle = String(updateData.jobTitle || '').trim().slice(0, 120);
        }
        if (next.jobTitle !== undefined) {
          next.jobTitle = String(next.jobTitle || '').trim().slice(0, 120);
        }
        if (next.profileCompletedAt !== undefined) {
          next.profileCompletedAt = String(next.profileCompletedAt || '').trim();
        }
        updateFields.preferences = next;
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
      Object.assign(
        updateFields,
        writePiiPatch({
          bio: updateData.bio,
          phone: updateData.phone,
          location: updateData.location,
          dateOfBirth: updateData.dateOfBirth,
        })
      );

      const capabilityIntent = resolveCapabilityIntent(updateData, capabilityMode);
      if (capabilityIntent) {
        const applied = applyCapabilityAction(existingProfile?.capability || null, capabilityIntent.action, {
          fields: capabilityIntent.fields,
          actorUserId,
          rejectReason: capabilityIntent.rejectReason,
          evidenceBoardId: capabilityIntent.evidenceBoardId,
          jobTitle: resolveJobTitle({
            ...existingProfile,
            preferences: updateFields.preferences || existingProfile?.preferences,
          }),
        });
        if (!applied.ok) {
          const status =
            applied.errorCode === 'CAPABILITY_VERIFY_NOT_PENDING' ||
            applied.errorCode === 'CAPABILITY_REJECT_NOT_PENDING'
              ? 409
              : 400;
          throw serviceError(applied.message, status, applied.errorCode);
        }
        updateFields.capability = applied.capability;
      }

      if (Object.keys(updateFields).length === 0) {
        if (!existingProfile) {
          throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
        }
        return existingProfile;
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

  /**
   * Internal — trả danh sách employeeCode đã tồn tại (uppercase) trong các mã gửi lên.
   * Dùng precheck Excel import (strict trước khi provision).
   */
  async findTakenEmployeeCodes(codes) {
    const normalized = [
      ...new Set(
        (Array.isArray(codes) ? codes : [])
          .map((c) => String(c || '').trim().toUpperCase())
          .filter(Boolean)
      ),
    ];
    if (!normalized.length) return [];

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await UserProfile.find({
      $or: normalized.map((c) => ({
        employeeCode: new RegExp(`^${escapeRegex(c)}$`, 'i'),
      })),
    })
      .select('employeeCode')
      .lean();

    return [
      ...new Set(
        rows
          .map((r) => String(r.employeeCode || '').trim().toUpperCase())
          .filter(Boolean)
      ),
    ];
  }

  /**
   * Internal — max số thứ tự employeeCode theo prefix (VD VH- → 1 từ VH-001).
   * Dùng bootstrap counter org-service (invite + Excel cùng sequence).
   */
  async findMaxEmployeeCodeSeq(prefix = 'VH-') {
    const p = String(prefix || 'VH-')
      .trim()
      .toUpperCase() || 'VH-';
    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const rows = await UserProfile.find({
      employeeCode: { $regex: `^${escapeRegex(p)}\\d+$`, $options: 'i' },
    })
      .select('employeeCode')
      .lean();

    let max = 0;
    for (const r of rows) {
      const raw = String(r.employeeCode || '')
        .trim()
        .toUpperCase();
      if (!raw.startsWith(p)) continue;
      const rest = raw.slice(p.length);
      if (!/^\d+$/.test(rest)) continue;
      const n = Number(rest);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max;
  }

  /**
   * Internal — append 1 DA closed_board (idempotent theo evidenceBoardId).
   * Không đè skills / Excel / verificationStatus cả hồ sơ.
   */
  async appendClosedBoardExperience(userId, rawExperience) {
    const uid = String(userId || '').trim();
    if (!uid) throw serviceError('userId là bắt buộc', 400, 'USER_VALIDATION');

    const profile = await UserProfile.findOne({ userId: uid });
    if (!profile) {
      throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
    }

    const capPlain =
      typeof profile.capability?.toObject === 'function'
        ? profile.capability.toObject()
        : { ...(profile.capability || {}) };
    const merged = mergeClosedBoardExperience(capPlain.projectExperiences, rawExperience);
    if (!merged.ok) {
      throw serviceError('projectExperience đóng board không hợp lệ', 400, merged.errorCode);
    }

    const nextCap = {
      ...emptyCapability(),
      ...capPlain,
      projectExperiences: merged.list,
      updatedAt: new Date(),
    };
    profile.set('capability', nextCap);
    await profile.save();
    return profile;
  }

  /**
   * Internal — bulk import profile fields from org-service (Excel).
   * Không chạy FSM verify/capability sanitize FSM vì org-service đã là HR internal.
   */
  async internalBulkImportProfileFields(userId, payload) {
    const uid = String(userId || '').trim();
    if (!uid) throw serviceError('userId là bắt buộc', 400, 'USER_VALIDATION');

    const body = payload && typeof payload === 'object' ? payload : {};
    if (String(body.mode || '').trim() === 'append_closed_board') {
      return this.appendClosedBoardExperience(uid, body.experience || body);
    }
    const now = new Date();

    const employeeCodeRaw =
      body.employeeCode != null ? String(body.employeeCode || '').trim() : '';
    const employeeCode = employeeCodeRaw ? employeeCodeRaw.toUpperCase() : null;

    if (employeeCode) {
      const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const clash = await UserProfile.findOne({
        userId: { $ne: uid },
        employeeCode: new RegExp(`^${escapeRegex(employeeCode)}$`, 'i'),
      })
        .select('userId employeeCode')
        .lean();
      if (clash) {
        throw serviceError(
          `employeeCode đã tồn tại: ${employeeCode}`,
          409,
          'EMPLOYEE_CODE_TAKEN'
        );
      }
    }
    const jobTitle = body.jobTitle != null ? String(body.jobTitle || '').trim() : '';
    const displayName =
      body.displayName != null ? String(body.displayName || '').trim().slice(0, 100) : '';
    const hasPhoneField = Object.prototype.hasOwnProperty.call(body, 'phone');

    const capRaw = body.capability && typeof body.capability === 'object' ? body.capability : {};
    const primaryDomain = String(capRaw.primaryDomain || body.primaryDomain || 'other').trim();
    const availability = String(capRaw.availability || 'available').trim();
    const yearsExperienceRaw = capRaw.yearsExperience ?? body.yearsExperience;
    const yearsExperience =
      yearsExperienceRaw == null || yearsExperienceRaw === '' ? null : Math.round(Number(yearsExperienceRaw));

    const skills = Array.isArray(capRaw.skills) ? capRaw.skills : [];
    const normalizedSkills = skills
      .map((s) => {
        const name = String(s?.name || s).trim();
        if (!name) return null;
        let level = Number(s?.level ?? 3);
        if (!Number.isFinite(level)) level = 3;
        level = Math.max(1, Math.min(5, Math.round(level)));
        return { name, level };
      })
      .filter(Boolean)
      .slice(0, 20);

    const summary = String(capRaw.summary || body.summary || '').trim().slice(0, 1000);

    // Schema enums: primaryDomain/availability are validated by UI submit; here we fail-safe.
    const safeAvailability = ['available', 'busy', 'partial'].includes(availability) ? availability : 'available';
    const safePrimaryDomain = primaryDomain ? primaryDomain : 'other';

    const capSourceRaw = String(capRaw.source || '').trim();
    const capSource =
      capSourceRaw === 'excel_import' || capSourceRaw === 'cv_parse' ? capSourceRaw : 'manual';
    const projectExperiences = (Array.isArray(capRaw.projectExperiences) ? capRaw.projectExperiences : [])
      .map((p) => {
        const name = String(p?.name || '').trim();
        const role = String(p?.role || '').trim();
        const work = String(p?.work || '').trim().slice(0, 300);
        if (!name || !role || !work) return null;
        const yearRaw = p?.year;
        let year;
        if (yearRaw != null && yearRaw !== '') {
          const y = Number(yearRaw);
          if (Number.isFinite(y) && y >= 1970 && y <= 2100) year = Math.floor(y);
        }
        const itemSource = String(p?.source || capSource || 'excel_import').trim();
        const safeItemSource = ['excel_import', 'closed_board', 'cv_parse', 'manual'].includes(itemSource)
          ? itemSource
          : 'excel_import';
        return {
          name,
          role,
          work,
          ...(year != null ? { year } : {}),
          source: safeItemSource,
          status: String(p?.status || 'verified') === 'suggested' ? 'suggested' : 'verified',
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    const capability = {
      positionCode: capRaw.positionCode || '',
      primaryDomain: safePrimaryDomain,
      yearsExperience: yearsExperience == null || !Number.isFinite(yearsExperience) ? null : yearsExperience,
      skills: normalizedSkills,
      availability: safeAvailability,
      summary,
      verificationStatus: 'verified',
      source: projectExperiences.length && capSource === 'manual' ? 'excel_import' : capSource,
      rejectReason: '',
      submittedAt: null,
      verifiedAt: now,
      verifiedBy: body.uploadedBy || null,
      rejectedAt: null,
      updatedAt: now,
      cvFilePath: capRaw.cvFilePath || '',
      cvFileName: capRaw.cvFileName || '',
      cvUploadedAt: capRaw.cvUploadedAt || null,
      projectExperiences,
    };

    const rcRaw = body.resourceConfig && typeof body.resourceConfig === 'object' ? body.resourceConfig : {};
    const maxConcurrentProjects = Number(
      rcRaw.maxConcurrentProjects ?? body.maxConcurrentProjects ?? capRaw.maxConcurrentProjects ?? 2
    );
    if (!Number.isFinite(maxConcurrentProjects) || maxConcurrentProjects < 1 || maxConcurrentProjects > 20) {
      throw serviceError('maxConcurrentProjects không hợp lệ', 400, 'RESOURCE_CONFIG_MAX_INVALID');
    }

    const resourceConfig = {
      maxConcurrentProjects: Math.floor(maxConcurrentProjects),
      verificationStatus: 'verified',
      verifiedAt: now,
      verifiedBy: body.uploadedBy || null,
      rejectedAt: null,
      rejectReason: '',
      updatedAt: now,
    };

    // Invite accept: chỉ gắn mã NV / chức danh / capacity mặc định — không xóa capability draft của NV.
    const structureOnly =
      body.structureOnly === true || body.skipCapability === true;

    const setFields = {};
    if (employeeCode) setFields.employeeCode = employeeCode;
    if (body.jobTitle != null) setFields['preferences.jobTitle'] = jobTitle;
    if (displayName) setFields.displayName = displayName;

    if (!structureOnly) {
      setFields.capability = capability;
      setFields.resourceConfig = resourceConfig;
    } else if (body.resourceConfig && typeof body.resourceConfig === 'object') {
      setFields.resourceConfig = resourceConfig;
    }

    if (!Object.keys(setFields).length && !hasPhoneField) {
      throw serviceError('Không có field để cập nhật', 400, 'USER_BULK_EMPTY');
    }

    let unsetFields = null;
    if (hasPhoneField) {
      const pii = writePiiPatch({ phone: body.phone });
      Object.assign(setFields, pii.patch || {});
      if (Array.isArray(pii.unset) && pii.unset.length) {
        unsetFields = Object.fromEntries(pii.unset.map((k) => [k, 1]));
      }
    }

    const updateOps = { $set: setFields };
    if (unsetFields) updateOps.$unset = unsetFields;

    let updated = await UserProfile.findOneAndUpdate(
      { userId: uid },
      updateOps,
      { new: true, runValidators: true }
    );

    // Excel/HR import: auth có thể tồn tại trong khi profile chưa bootstrap (hoặc đã deactivate).
    // Tự tạo profile tối thiểu rồi apply lại bulk fields — tránh 404 làm fail cả batch.
    if (!updated) {
      const emailRaw =
        body.email != null
          ? String(body.email || '').trim().toLowerCase()
          : '';
      if (!emailRaw || !emailRaw.includes('@')) {
        throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
      }
      try {
        await this.createUserProfile({
          userId: uid,
          email: emailRaw,
          displayName: displayName || emailRaw.split('@')[0],
          username: emailRaw.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24),
        });
      } catch (createErr) {
        // Race: profile vừa được bootstrap song song
        const again = await UserProfile.findOne({ userId: uid }).select('_id').lean();
        if (!again) throw createErr;
      }
      updated = await UserProfile.findOneAndUpdate(
        { userId: uid },
        updateOps,
        { new: true, runValidators: true }
      );
    }

    if (!updated) {
      throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
    }
    return updated;
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

  /**
   * C2 — Upload PDF CV → parse → save_draft (source=cv_parse). Không tự verified.
   * @param {string} userId
   * @param {{ path: string, originalname?: string, filename?: string }} file
   */
  async uploadCapabilityCv(userId, file) {
    if (!file?.path) {
      throw serviceError('Missing CV file', 400, 'CV_FILE_REQUIRED');
    }
    const existingProfile = await UserProfile.findOne({ userId }).lean();
    if (!existingProfile) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
    }

    const parsed = await parseCvFileToFields(file.path);
    if (!parsed.ok) {
      try {
        fs.unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw serviceError(parsed.message, 400, parsed.errorCode);
    }

    const relPath = `/uploads/cv/${path.basename(file.path)}`;
    const applied = applyCapabilityAction(existingProfile.capability || null, 'save_draft', {
      fields: parsed.fields,
      source: 'cv_parse',
      cvMeta: {
        cvFilePath: relPath,
        cvFileName: String(file.originalname || file.filename || 'cv.pdf'),
        cvUploadedAt: new Date(),
      },
    });
    if (!applied.ok) {
      throw serviceError(applied.message, 400, applied.errorCode);
    }

    const userProfile = await UserProfile.findOneAndUpdate(
      { userId },
      { $set: { capability: applied.capability } },
      { new: true, runValidators: true }
    );
    if (!userProfile) {
      throw serviceError('Không tìm thấy hồ sơ người dùng', 404, 'USER_PROFILE_NOT_FOUND');
    }

    const redis = getRedisClient();
    if (redis) {
      await redis.del(`user:${userId}`);
    }

    return {
      profile: userProfile,
      parseNote: parsed.parseNote || 'ok',
      skillsFound: Array.isArray(parsed.fields?.skills) ? parsed.fields.skills.length : 0,
    };
  }
}

module.exports = new UserService();

