const adminUserService = require('../services/adminUser.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');
const { requireObjectId } = require('../utils/validateInput');
const { readBooleanStrict, resolveSafeFrontendUrl } = require('../utils/authInputSafety');

const MAX_SUMMARY_BATCH = 500;

class AdminUserController {
  async getSummary(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const data = await adminUserService.getAuthSummary(userId);
      if (!data) {
        return sendServiceError(res, 404, {
          errorCode: 'AUTH_USER_NOT_FOUND',
          messageUser: 'Không tìm thấy tài khoản.',
          message: 'User not found',
        });
      }
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async lockUser(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const locked = readBooleanStrict(req.body?.locked);
      if (locked === null) {
        return sendServiceError(res, 400, {
          errorCode: 'AUTH_VALIDATION_ERROR',
          messageUser: 'Giá trị khóa không hợp lệ.',
          message: 'locked must be a boolean',
        });
      }
      const data = await adminUserService.setUserLocked(userId, locked);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async forcePasswordChange(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const mustChange = req.body?.mustChangePassword !== false;
      const data = await adminUserService.setMustChangePassword(userId, mustChange);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async triggerPasswordReset(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const frontendUrl = resolveSafeFrontendUrl(req.body?.frontendUrl || req.headers.origin);
      const data = await adminUserService.triggerPasswordReset(userId, frontendUrl);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async listLoginEvents(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const data = await adminUserService.listLoginEvents(userId, {
        limit: req.query?.limit,
        page: req.query?.page,
        level: req.companyAdmin?.level,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async revokeSessions(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const data = await adminUserService.revokeUserSessions(userId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async setPassword(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const data = await adminUserService.setPasswordByAdmin(userId, {
        password: req.body?.password,
        mustChangePassword: req.body?.mustChangePassword,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async activatePending(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const data = await adminUserService.activatePendingByAdmin(userId, {
        mustChangePassword: req.body?.mustChangePassword !== false,
      });
      return res.json({
        success: true,
        data,
        message: 'Đã kích hoạt tài khoản. Mật khẩu tạm chỉ hiện một lần.',
      });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async resendVerification(req, res) {
    try {
      const userId = requireObjectId(res, req.params.userId, 'userId');
      if (!userId) return undefined;
      const frontendUrl = resolveSafeFrontendUrl(req.body?.frontendUrl || req.headers.origin);
      const data = await adminUserService.resendVerificationByUserId(userId, frontendUrl);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }
}

async function internalAuthSummaryBatch(req, res) {
  try {
    const userIds = Array.isArray(req.body?.userIds) ? req.body.userIds : [];
    if (userIds.length > MAX_SUMMARY_BATCH) {
      return sendServiceError(res, 400, {
        errorCode: 'AUTH_VALIDATION_ERROR',
        messageUser: `Tối đa ${MAX_SUMMARY_BATCH} tài khoản mỗi lần.`,
        message: 'userIds exceeds batch limit',
      });
    }
    const data = await adminUserService.getAuthSummaryBatch(userIds);
    return res.json({ success: true, data: { profiles: data } });
  } catch (error) {
    return sendErrorFromCatch(res, error);
  }
}

module.exports = {
  adminUserController: new AdminUserController(),
  internalAuthSummaryBatch,
};
