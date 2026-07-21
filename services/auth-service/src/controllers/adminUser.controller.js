const adminUserService = require('../services/adminUser.service');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');

class AdminUserController {
  async getSummary(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
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
      const userId = String(req.params.userId || '').trim();
      const locked = req.body?.locked !== false;
      const data = await adminUserService.setUserLocked(userId, locked);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async forcePasswordChange(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const mustChange = req.body?.mustChangePassword !== false;
      const data = await adminUserService.setMustChangePassword(userId, mustChange);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async triggerPasswordReset(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const frontendUrl = String(req.body?.frontendUrl || req.headers.origin || '').trim();
      const data = await adminUserService.triggerPasswordReset(userId, frontendUrl);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async listLoginEvents(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const data = await adminUserService.listLoginEvents(userId, {
        limit: req.query?.limit,
        page: req.query?.page,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async revokeSessions(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const data = await adminUserService.revokeUserSessions(userId);
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async setPassword(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const data = await adminUserService.setPasswordByAdmin(userId, {
        password: req.body?.password,
        mustChangePassword: req.body?.mustChangePassword,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendErrorFromCatch(res, error);
    }
  }

  async resendVerification(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      const frontendUrl = String(req.body?.frontendUrl || req.headers.origin || '').trim();
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
