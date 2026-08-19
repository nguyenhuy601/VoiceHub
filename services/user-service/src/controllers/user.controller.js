const path = require('path');
const fs = require('fs');
const userService = require('../services/user.service');
const { logger, getRedisClient } = require('@enterprise/shared');
const { isEncryptionEnabled } = require('@enterprise/shared/utils/fieldCrypto');
const { readPiiFromProfile } = require('../utils/profilePii');
const { authEmailFromReq, withAuthEmailFallback } = require('../utils/withAuthEmailFallback');
const { uploadsDir } = require('../config/uploadsPath');
const {
  fetchAuthSummaryByUserId,
  fetchAuthSummaryByUserIds,
} = require('../clients/authSummary.client');

const {
  toPublicVerifiedCapability,
  emptyCapability,
  assertHrOnlyCapabilityReview,
} = require('../services/capabilityProfile.service');

/** Định danh người gọi (chỉ từ userContext sau khi header gateway đã được tin cậy). */
function actorUserId(req) {
  return req.userContext?.userId || req.user?.id || null;
}

function safeProfilePayload(profile) {
  if (!profile) return profile;
  const plain = typeof profile.toObject === 'function' ? profile.toObject() : { ...profile };
  const pii = readPiiFromProfile(plain);
  return {
    ...plain,
    ...pii,
  };
}

/**
 * Self / company-admin: full capability.
 * Other members: chỉ bản verified công khai (hoặc null).
 */
function shapeProfilePayload(profile, { isSelf = false, isCompanyAdmin = false } = {}) {
  const payload = safeProfilePayload(profile);
  if (!payload || typeof payload !== 'object') return payload;
  if (isSelf || isCompanyAdmin) {
    if (!payload.capability) {
      payload.capability = emptyCapability();
    }
    return payload;
  }
  payload.capability = toPublicVerifiedCapability(payload.capability);
  return payload;
}

function isSelfProfileRequest(req, targetUserId) {
  const actor = String(actorUserId(req) || '').trim();
  const target = String(targetUserId || '').trim();
  return Boolean(actor && target && actor === target);
}

/**
 * Chỉ reconcile / fallback email khi xem hồ sơ của CHÍNH mình.
 * Tránh admin mở Nhân sự → ghi/đổ email admin vào mọi profile thiếu email.
 */
async function reconcileProfileEmail(req, userId, userProfile) {
  if (!userProfile || !userId) return userProfile;
  if (!isSelfProfileRequest(req, userId)) return userProfile;

  const plain =
    typeof userProfile?.toObject === 'function' ? userProfile.toObject() : { ...userProfile };
  const profileEmail = readPiiFromProfile(plain).email;
  const hasStoredEmailArtifact =
    Boolean(String(plain.email || '').trim()) || Boolean(plain.emailBlindIndex);
  const authEmail = authEmailFromReq(req);
  if (!profileEmail && hasStoredEmailArtifact) {
    const authSummary = await fetchAuthSummaryByUserId(userId);
    const recoveredEmail = String(authSummary?.email || '').trim();
    if (recoveredEmail) {
      return userProfile;
    }
    if (isEncryptionEnabled()) {
      logger.warn(
        `Profile email decrypt failed for userId=${userId} — skip recover (check ENCRYPTION_MASTER_KEY)`
      );
    }
    return userProfile;
  }
  if (!profileEmail && authEmail) {
    try {
      return await userService.updateUserEmailInternal(userId, authEmail);
    } catch (repairErr) {
      logger.warn(
        `Failed to recover missing profile email for userId=${userId}: ${
          repairErr?.message || 'unknown error'
        }`
      );
    }
  }
  return userProfile;
}

async function enrichPayloadEmailFromAuth(userId, payload, authSummary = null) {
  if (!payload || typeof payload !== 'object') return payload;
  if (String(payload.email || '').trim()) return payload;
  const auth = authSummary || (await fetchAuthSummaryByUserId(userId));
  return withAuthEmailFallback(null, payload, auth);
}

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  const status = Number(err?.statusCode) || fallbackStatus;
  const message = String(err?.message || fallbackMessage);
  const errorCode = String(err?.errorCode || fallbackCode || '').trim();
  return res.status(status).json({
    success: false,
    message,
    ...(errorCode ? { errorCode } : {}),
    messageUser: message,
  });
}

class UserController {
  // Tạo user profile mới
  async createUserProfile(req, res) {
    try {
      const { userId, username, email, displayName, dateOfBirth } = req.body;

      if (!userId || !username) {
        return res.status(400).json({
          success: false,
          message: 'userId and username are required',
        });
      }
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({
          success: false,
          message: 'email is required',
        });
      }

      const existing = await userService.getUserProfileById(userId);
      if (existing) {
        return res.status(200).json({
          success: true,
          created: false,
          data: safeProfilePayload(existing),
        });
      }

      const displayFromBody =
        displayName && String(displayName).trim()
          ? String(displayName).trim()
          : email.trim().toLowerCase().split('@')[0];

      const userProfile = await userService.ensureUserProfile(userId, {
        email: email.trim().toLowerCase(),
        displayName: displayFromBody,
        username,
        dateOfBirth,
      });

      res.status(201).json({
        success: true,
        created: true,
        data: safeProfilePayload(userProfile),
      });
    } catch (error) {
      logger.error('Create user profile error:', error);
      return sendError(res, error, 400, 'Không thể tạo hồ sơ người dùng', 'USER_CREATE_FAILED');
    }
  }

  // Lấy user profile theo ID
  async getUserProfileById(req, res) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
        });
      }
      let userProfile = await userService.getUserProfileById(userId);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      userProfile = await reconcileProfileEmail(req, userId, userProfile);

      const isSelf = isSelfProfileRequest(req, userId);
      const payload = shapeProfilePayload(userProfile, {
        isSelf,
        isCompanyAdmin: false,
      });
      const data = isSelf
        ? withAuthEmailFallback(req, payload, null, { allowCallerEmail: true })
        : await enrichPayloadEmailFromAuth(userId, payload);

      res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Get user profile error:', error);
      return sendError(res, error, 500, 'Không thể tải hồ sơ người dùng', 'USER_GET_FAILED');
    }
  }

  // Lấy user profile theo username
  async getUserProfileByUsername(req, res) {
    try {
      const { username } = req.params;
      if (!username || !String(username).trim()) {
        return res.status(400).json({
          success: false,
          message: 'username is required',
        });
      }
      const userProfile = await userService.getUserProfileByUsername(username);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: safeProfilePayload(userProfile),
      });
    } catch (error) {
      logger.error('Get user profile by username error:', error);
      return sendError(res, error, 500, 'Không thể tải hồ sơ người dùng', 'USER_GET_FAILED');
    }
  }

  // Lấy user profile theo số điện thoại
  async getUserProfileByPhone(req, res) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          message: 'Phone is required',
        });
      }

      const userProfile = await userService.getUserProfileByPhone(phone);

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      res.json({
        success: true,
        data: safeProfilePayload(userProfile),
      });
    } catch (error) {
      logger.error('Get user profile by phone error:', error);
      return sendError(res, error, 500, 'Không thể tải hồ sơ người dùng', 'USER_GET_FAILED');
    }
  }

  // Lấy thông tin user hiện tại (userId từ gateway header x-user-id hoặc userContext)
  async getCurrentUser(req, res) {
    try {
      const userId = actorUserId(req);

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const authEmail = authEmailFromReq(req);
      let userProfile = await userService.getUserProfileById(userId);

      if (!userProfile && authEmail) {
        try {
          userProfile = await userService.ensureUserProfile(userId, {
            email: authEmail,
            displayName: authEmail.split('@')[0],
          });
          if (userProfile) {
            logger.info(`Lazy user profile ensured for ${userId}`);
          }
        } catch (bootstrapErr) {
          logger.warn('Lazy profile bootstrap failed:', bootstrapErr.message);
        }
      }

      if (userProfile) {
        try {
          await userService.updateStatus(userId, 'online');
        } catch (statusError) {
          logger.warn('Failed to update user status:', statusError.message);
        }
      }

      if (!userProfile) {
        userProfile = await userService.getUserProfileById(userId);
      }

      if (!userProfile) {
        return res.status(404).json({
          success: false,
          message: 'User profile not found',
        });
      }

      userProfile = await reconcileProfileEmail(req, userId, userProfile);

      res.json({
        success: true,
        data: withAuthEmailFallback(
          req,
          shapeProfilePayload(userProfile, { isSelf: true }),
          null,
          { allowCallerEmail: true }
        ),
      });
    } catch (error) {
      logger.error('Get current user error:', error);
      return sendError(res, error, 500, 'Không thể tải thông tin người dùng', 'USER_CURRENT_FAILED');
    }
  }

  // Cập nhật user profile
  async updateUserProfile(req, res) {
    try {
      const actorId = actorUserId(req);
      if (!actorId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }
      if (req.params.userId && String(req.params.userId) !== String(actorId)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden',
        });
      }
      const userId = actorId;

      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const userProfile = await userService.updateUserProfile(userId, body, {
        capabilityMode: 'self',
        actorUserId: actorId,
      });

      res.json({
        success: true,
        data: shapeProfilePayload(userProfile, { isSelf: true }),
      });
    } catch (error) {
      logger.error('Update user profile error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật hồ sơ', 'USER_UPDATE_FAILED');
    }
  }

  // Cập nhật status
  async updateStatus(req, res) {
    try {
      const userId = actorUserId(req);
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
      return sendError(res, error, 400, 'Không thể cập nhật trạng thái', 'USER_STATUS_FAILED');
    }
  }

  /**
   * Cập nhật status từ dịch vụ nội bộ (socket-service presence).
   * PATCH body: { userId, status } — đã qua internalServiceAuth.
   */
  /**
   * Batch đọc presence "nóng" từ Redis (socket-service ghi vh:presence:*).
   * friend-service / gateway có thể gọi để merge với profile.
   */
  async internalPresenceBatch(req, res) {
    try {
      const { userIds } = req.body || {};
      if (!Array.isArray(userIds) || userIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'userIds must be a non-empty array',
        });
      }

      const PREFIX = process.env.PRESENCE_REDIS_PREFIX || 'vh:presence:';
      const slice = userIds.slice(0, 200).map((id) => String(id));
      const out = {};

      let redis;
      try {
        redis = getRedisClient();
      } catch {
        redis = null;
      }

      if (redis) {
        const pipeline = redis.pipeline();
        for (const id of slice) {
          pipeline.get(`${PREFIX}${id}`);
        }
        const results = await pipeline.exec();
        slice.forEach((id, i) => {
          const val = results[i]?.[1];
          out[id] = val === 'online' ? 'online' : 'offline';
        });
      } else {
        for (const id of slice) {
          out[id] = 'offline';
        }
      }

      res.json({
        success: true,
        data: out,
      });
    } catch (error) {
      logger.error('internalPresenceBatch error:', error);
      return sendError(res, error, 500, 'Không thể tìm kiếm người dùng', 'USER_SEARCH_FAILED');
    }
  }

  async patchInternalStatus(req, res) {
    try {
      const { userId, status } = req.body || {};

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
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
      logger.error('Internal patch status error:', error);
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * Cập nhật email profile từ auth-service sau khi xác thực đổi email thành công.
   * PATCH body: { userId, email } — đã qua internalServiceAuth.
   */
  async patchInternalEmail(req, res) {
    try {
      const userId = String(req.body?.userId || '').trim();
      const email = String(req.body?.email || '').trim().toLowerCase();
      if (!userId || !email) {
        return res.status(400).json({
          success: false,
          message: 'userId and email are required',
        });
      }
      const userProfile = await userService.updateUserEmailInternal(userId, email);
      return res.json({
        success: true,
        data: safeProfilePayload(userProfile),
      });
    } catch (error) {
      logger.error('Internal patch email error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật email nội bộ', 'USER_INTERNAL_EMAIL_FAILED');
    }
  }

  // Tìm kiếm users
  async searchUsers(req, res) {
    try {
      const { q, page, limit } = req.query;

      if (!q || String(q).trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Search query is required',
        });
      }

      const result = await userService.searchUsers(q, {
        page: page || 1,
        limit: limit || 20,
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

  async getUserAvatar(req, res) {
    try {
      const requesterId = actorUserId(req);
      if (!requesterId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const { userId } = req.params;
      const profile = await userService.getUserProfileById(userId);
      if (!profile?.avatar) {
        return res.status(404).json({ success: false, message: 'Avatar not found' });
      }
      const rel = String(profile.avatar).replace(/^\/uploads\//, '').replace(/^uploads\//, '');
      const safeName = path.basename(rel);
      const filePath = path.join(uploadsDir, safeName);
      if (!filePath.startsWith(uploadsDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'Avatar file not found' });
      }
      return res.sendFile(filePath);
    } catch (error) {
      logger.error('Get user avatar error:', error);
      return sendError(res, error, 404, 'Không thể tải ảnh đại diện', 'USER_AVATAR_GET_FAILED');
    }
  }

  async uploadAvatar(req, res) {
    try {
      const userId = actorUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const avatarUrl = `/uploads/${req.file.filename}`;
      const userProfile = await userService.updateUserProfile(userId, { avatar: avatarUrl });
      const plain = safeProfilePayload(userProfile);
      const avatar = plain?.avatar || avatarUrl;

      res.json({
        success: true,
        data: {
          ...plain,
          avatarUrl: avatar,
          avatar,
        },
      });
    } catch (error) {
      logger.error('Upload avatar error:', error);
      return sendError(res, error, 400, 'Không thể tải ảnh đại diện lên', 'USER_AVATAR_UPLOAD_FAILED');
    }
  }

  /** C2 — Upload PDF CV → prefill capability (save_draft, source=cv_parse) */
  async uploadCapabilityCv(req, res) {
    try {
      const userId = actorUserId(req);
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No PDF uploaded',
          errorCode: 'CV_FILE_REQUIRED',
        });
      }
      const result = await userService.uploadCapabilityCv(userId, req.file);
      return res.json({
        success: true,
        data: shapeProfilePayload(result.profile, { isSelf: true }),
        meta: {
          parseNote: result.parseNote,
          skillsFound: result.skillsFound,
        },
      });
    } catch (error) {
      logger.error('Upload capability CV error:', error);
      return sendError(res, error, 400, 'Không thể đọc CV PDF', 'CV_UPLOAD_FAILED');
    }
  }

  // Batch profiles — S2S enrich (organization-service admin list)
  async internalProfilesBatch(req, res) {
    try {
      const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
      const ids = [...new Set(userIds.map((id) => String(id || '').trim()).filter(Boolean))];
      const authMap = await fetchAuthSummaryByUserIds(ids);
      const profiles = await Promise.all(
        ids.map(async (userId) => {
          const profile = await userService.getUserProfileById(userId);
          if (!profile) return null;
          const payload = safeProfilePayload(profile);
          const enriched = await enrichPayloadEmailFromAuth(userId, payload, authMap.get(userId));
          return { ...enriched, userId: String(enriched.userId || userId) };
        })
      );
      return res.json({
        success: true,
        data: {
          profiles: profiles.filter(Boolean),
        },
      });
    } catch (error) {
      logger.error('internalProfilesBatch error:', error);
      return sendError(res, error, 500, 'Không thể tải hồ sơ', 'USER_BATCH_FAILED');
    }
  }

  async adminGetProfile(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const profile = await userService.getUserProfileById(userId);
      if (!profile) {
        return res.status(404).json({ success: false, message: 'User profile not found' });
      }
      const authSummary = await fetchAuthSummaryByUserId(userId);
      const payload = await enrichPayloadEmailFromAuth(
        userId,
        shapeProfilePayload(profile, { isCompanyAdmin: true }),
        authSummary
      );
      return res.json({ success: true, data: payload });
    } catch (error) {
      logger.error('adminGetProfile error:', error);
      return sendError(res, error, 500, 'Không thể tải hồ sơ', 'USER_GET_FAILED');
    }
  }

  async adminPatchProfile(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const actorId = actorUserId(req);
      // Chuẩn vàng (1)+(a): chỉ orgRole HR được verify/reject năng lực — Owner/Admin không.
      const capabilityAction = String(body.capabilityAction || '').trim();
      const hrGate = assertHrOnlyCapabilityReview(req.companyAdmin?.level, capabilityAction);
      if (!hrGate.ok) {
        return res.status(hrGate.statusCode).json({
          success: false,
          message: hrGate.message,
          errorCode: hrGate.errorCode,
          messageUser: hrGate.messageUser,
        });
      }
      const userProfile = await userService.updateUserProfile(userId, body, {
        capabilityMode: 'admin',
        actorUserId: actorId,
      });
      return res.json({
        success: true,
        data: shapeProfilePayload(userProfile, { isCompanyAdmin: true }),
      });
    } catch (error) {
      logger.error('adminPatchProfile error:', error);
      return sendError(res, error, 400, 'Không thể cập nhật hồ sơ', 'USER_UPDATE_FAILED');
    }
  }

  // Xóa user profile
  async deleteUserProfile(req, res) {
    try {
      const { userId } = req.params;
      const currentUserId = actorUserId(req);

      if (!currentUserId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const currentStr = String(currentUserId);
      const targetStr = String(userId);
      if (targetStr !== currentStr) {
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
      return sendError(res, error, 400, 'Không thể xóa hồ sơ người dùng', 'USER_DELETE_FAILED');
    }
  }

  /** S2S — org Excel/HR bulk profile fields (trước protect JWT). */
  async internalBulkImportProfileFields(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId là bắt buộc',
          errorCode: 'USER_VALIDATION',
        });
      }
      const data = await userService.internalBulkImportProfileFields(userId, req.body || {});
      return res.status(200).json({
        success: true,
        data: safeProfilePayload(data),
      });
    } catch (error) {
      logger.error('internalBulkImportProfileFields error:', error);
      return sendError(
        res,
        error,
        error.statusCode || 400,
        error.message || 'Bulk import profile failed',
        error.errorCode || 'USER_BULK_IMPORT_FAILED'
      );
    }
  }

  /** S2S — compensate Excel rollback: soft-deactivate profile. */
  async internalDeactivateProfile(req, res) {
    try {
      const userId = String(req.params.userId || req.body?.userId || '').trim();
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId là bắt buộc',
          errorCode: 'USER_VALIDATION',
        });
      }
      const data = await userService.deleteUserProfile(userId);
      return res.status(200).json({
        success: true,
        data: safeProfilePayload(data),
      });
    } catch (error) {
      logger.error('internalDeactivateProfile error:', error);
      return sendError(
        res,
        error,
        error.statusCode || 400,
        error.message || 'Deactivate profile failed',
        error.errorCode || 'USER_DEACTIVATE_FAILED'
      );
    }
  }
}

module.exports = new UserController();

