const authService = require('../services/auth.service');
const adminUserService = require('../services/adminUser.service');
const emailService = require('../utils/email');
const { resolveFrontendUrl } = require('@enterprise/shared');
const { readEmailFromStored } = require('@enterprise/shared/utils/emailPii');
const { sendServiceError, sendErrorFromCatch } = require('../middleware/sendServiceError');
const { requireParam } = require('../utils/validateInput');
const {
  readRefreshTokenFromReq,
  setRefreshCookie,
  clearRefreshCookie,
} = require('../utils/refreshCookie');

function sendError(res, err, fallbackStatus, fallbackMessage, fallbackCode) {
  return sendErrorFromCatch(res, err, fallbackStatus, fallbackMessage, fallbackCode || 'AUTH_INTERNAL_ERROR');
}

class AuthController {
  // Đăng ký
  async register(req, res) {
    console.log('[AuthController] ========== REGISTER REQUEST RECEIVED ==========');
    console.log('[AuthController] Request method:', req.method);
    console.log('[AuthController] Request path:', req.path);
    if (process.env.NODE_ENV !== 'production') {
      console.log('[AuthController] Request headers keys:', Object.keys(req.headers || {}));
    }
    console.log('[AuthController] Request body exists:', !!req.body);
    
    // Kiểm tra nếu request đã bị abort
    if (req.aborted) {
      console.warn('[AuthController] Request already aborted, returning early');
      return;
    }

    try {
      console.log('[AuthController] Parsing request body...');
      const { email, password, firstName, lastName, dateOfBirth } = req.body;
      console.log('[AuthController] Parsed data:', { 
        email, 
        firstName, 
        lastName, 
        hasPassword: !!password,
        hasDateOfBirth: !!dateOfBirth 
      });

      // Validate required fields
      if (!email || !password) {
        return sendServiceError(res, 400, {
          errorCode: 'VALIDATION_REQUIRED',
          messageUser: 'Email và mật khẩu là bắt buộc.',
          message: 'Email and password are required',
        });
      }

      if (!firstName || !lastName) {
        return sendServiceError(res, 400, {
          errorCode: 'VALIDATION_REQUIRED',
          messageUser: 'Họ và tên là bắt buộc.',
          message: 'First name and last name are required',
        });
      }

      // dateOfBirth: bắt buộc khi đăng ký mới (validate trong auth.service)

      console.log('[AuthController] Starting registration for:', email);
      console.log('[AuthController] Calling authService.register()...');
      const startTime = Date.now();
      
      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.register(
        {
        email,
        password,
        firstName,
        lastName,
        dateOfBirth,
        },
        frontendUrl
      );

      const duration = Date.now() - startTime;
      console.log(`[AuthController] ✅ Registration service completed in ${duration}ms`);
      console.log('[AuthController] Result:', {
        hasUserAuth: !!result.userAuth,
        email: result.userAuth?.email,
        emailScheduled: result.emailScheduled,
      });

      // Kiểm tra lại nếu request đã bị abort trước khi gửi response
      if (req.aborted || res.headersSent) {
        console.warn('[AuthController] Request aborted or response already sent');
        return;
      }

      const responseData = {
        email: readEmailFromStored(result.userAuth?.email),
        message: 'Registration successful. Please check your email to verify your account.',
      };

      // Thêm thông tin về email verification
      if (result.emailScheduled) {
        responseData.emailScheduled = true;
        responseData.message = 'Đăng ký thành công! Email xác thực đang được gửi. Vui lòng kiểm tra hộp thư của bạn (có thể mất vài phút).';
        console.log('[AuthController] ✅ Email verification scheduled (check logs for sending status)');
      } else {
        responseData.emailScheduled = false;
        console.warn('[AuthController] ⚠️ Email service not configured');
        responseData.message = 'Đăng ký thành công. Email service chưa được cấu hình.';
      }

      // Chỉ trả về token nếu email service chưa được cấu hình (development mode)
      if (result.emailVerificationToken) {
        responseData.emailVerificationToken = result.emailVerificationToken;
        responseData.message = 'Registration successful. Please verify your email using the token below (development mode).';
      }

      console.log('[AuthController] Sending response:', {
        success: true,
        emailSent: responseData.emailSent,
        email: responseData.email,
      });

      res.status(201).json({
        success: true,
        message: responseData.message,
        data: responseData,
      });
    } catch (error) {
      console.error('[AuthController] ❌ ERROR in register:', error.message);
      console.error('[AuthController] Error stack:', error.stack);
      console.error('[AuthController] Error type:', error.constructor.name);
      
      // Kiểm tra nếu request đã bị abort hoặc response đã được gửi
      if (req.aborted || res.headersSent) {
        console.warn('[AuthController] Request aborted or response already sent, skipping error response');
        return;
      }

      // Xử lý lỗi request aborted
      if (error.message && error.message.includes('aborted')) {
        console.log('[AuthController] Request aborted during registration');
        return;
      }

      console.log('[AuthController] Sending error response to client...');
      return sendError(res, error, 400, 'Đăng ký thất bại', 'AUTH_REGISTER_FAILED');
      console.log('[AuthController] Error response sent');
    }
  }

  // Đăng nhập
  async login(req, res) {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    const userAgent = String(req.headers['user-agent'] || '').trim();
    let attemptedUserId = null;
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email and password are required',
        });
      }

      const result = await authService.login(email, password);
      attemptedUserId = result?.user?.id || result?.user?.userId || result?.userId || null;

      // Refresh token is HttpOnly cookie only (opaque refresh -> stored as hash server-side).
      if (result?.refreshToken) {
        setRefreshCookie(res, result.refreshToken, req);
      }
      void adminUserService.recordLoginEvent({
        userId: attemptedUserId,
        success: true,
        ip,
        userAgent,
      });

      const { refreshToken: _refreshToken, ...safeData } = result || {};
      res.json({
        success: true,
        data: safeData,
      });
    } catch (error) {
      void adminUserService.recordLoginEvent({
        userId: attemptedUserId,
        success: false,
        ip,
        userAgent,
        errorCode: error?.errorCode || 'AUTH_LOGIN_FAILED',
      });
      return sendError(res, error, 401, 'Đăng nhập thất bại', 'AUTH_LOGIN_FAILED');
    }
  }

  // Refresh token
  async refreshToken(req, res) {
    try {
      const refreshTokenRaw = readRefreshTokenFromReq(req);
      if (!refreshTokenRaw) {
        return sendServiceError(res, 401, {
          errorCode: 'AUTH_REFRESH_INVALID',
          messageUser: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
          message: 'Refresh token is required (HttpOnly cookie missing)',
        });
      }

      const result = await authService.refreshToken(refreshTokenRaw);

      if (result?.refreshToken) {
        setRefreshCookie(res, result.refreshToken, req);
      }

      const { refreshToken: _refreshToken, ...safeData } = result || {};

      res.json({
        success: true,
        data: safeData,
      });
    } catch (error) {
      return sendError(res, error, 401, 'Làm mới phiên thất bại', 'AUTH_REFRESH_FAILED');
    }
  }

  // Đăng xuất
  async logout(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      await authService.logout(userId);
      clearRefreshCookie(res, req);

      res.json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      return sendError(res, error, 500, 'Đăng xuất thất bại', 'AUTH_LOGOUT_FAILED');
    }
  }

  // Đổi mật khẩu
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const userId = req.user?.id || req.user?._id;

      if (!oldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Old password and new password are required',
        });
      }

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const result = await authService.changePassword(userId, oldPassword, newPassword);

      // Khi đổi mật khẩu, refresh token được rotate/bump tokenVersion.
      // Vì refresh token nằm trong HttpOnly cookie nên phải update cookie để silent-refresh tiếp tục hoạt động.
      if (result?.refreshToken) {
        setRefreshCookie(res, result.refreshToken, req);
      }

      const { refreshToken: _refreshToken, ...safeData } = result || {};

      res.json({
        success: true,
        message: 'Password changed successfully',
        data: safeData,
      });
    } catch (error) {
      return sendError(res, error, 400, 'Đổi mật khẩu thất bại', 'AUTH_CHANGE_PASSWORD_FAILED');
    }
  }

  // Quên mật khẩu
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.forgotPassword(email, frontendUrl);

      res.json({
        success: true,
        message: result.message,
        data: {
          emailScheduled: !!result.emailScheduled,
          ...(result.resetToken ? { resetToken: result.resetToken } : {}),
          ...(result.resetUrl ? { resetUrl: result.resetUrl } : {}),
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không thể xử lý yêu cầu lúc này', 'AUTH_FORGOT_PASSWORD_FAILED');
    }
  }

  // Gửi lại email xác thực
  async resendVerification(req, res) {
    try {
      const { email } = req.body || {};

      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Email is required',
        });
      }

      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.resendVerificationEmail(email, frontendUrl);

      res.json({
        success: true,
        message: result.message,
        data: {
          emailScheduled: !!result.emailScheduled,
          ...(result.alreadyVerified ? { alreadyVerified: true } : {}),
          ...(result.verificationToken ? { verificationToken: result.verificationToken } : {}),
          ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không thể xử lý yêu cầu lúc này', 'AUTH_RESEND_VERIFY_FAILED');
    }
  }

  async requestEmailChange(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;
      const { email } = req.body || {};
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      if (!email) {
        return res.status(400).json({ success: false, message: 'Email is required' });
      }
      const frontendUrl = resolveFrontendUrl(req);
      const result = await authService.requestEmailChange(userId, email, frontendUrl);
      return res.json({
        success: true,
        message: result.message,
        data: {
          emailScheduled: !!result.emailScheduled,
          ...(result.verificationToken ? { verificationToken: result.verificationToken } : {}),
          ...(result.verificationUrl ? { verificationUrl: result.verificationUrl } : {}),
        },
      });
    } catch (error) {
      return sendError(res, error, 400, 'Yêu cầu đổi email thất bại', 'AUTH_CHANGE_EMAIL_REQUEST_FAILED');
    }
  }

  async verifyEmailChange(req, res) {
    try {
      const token = req.query.token || req.body?.token;
      if (!token) {
        return res.status(400).json({
          success: false,
          message: 'Verification token is required',
        });
      }
      const result = await authService.verifyEmailChange(token);
      return res.json({
        success: true,
        message: 'Email đã được cập nhật thành công.',
        data: result,
      });
    } catch (error) {
      return sendError(res, error, 400, 'Xác thực đổi email thất bại', 'AUTH_CHANGE_EMAIL_VERIFY_FAILED');
    }
  }

  // Reset mật khẩu
  async resetPassword(req, res) {
    try {
      const resetToken = req.body?.resetToken || req.body?.token;
      const newPassword = req.body?.newPassword || req.body?.password;

      if (!resetToken || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Reset token and new password are required',
        });
      }

      await authService.resetPassword(resetToken, newPassword);

      res.json({
        success: true,
        message: 'Password reset successfully',
      });
    } catch (error) {
      return sendError(res, error, 400, 'Đặt lại mật khẩu thất bại', 'AUTH_RESET_PASSWORD_FAILED');
    }
  }

  // Xác thực email
  async verifyEmail(req, res) {
    try {
      console.log('[AuthController] verifyEmail:', req.method, req.path);

      // GET request: token chỉ có trong query string, KHÔNG có body
      // Lấy token từ query string (ưu tiên) hoặc body (nếu là POST)
      const verificationToken = req.query.token || req.body?.verificationToken || req.body?.token;

      console.log('[AuthController] Extracted token:', verificationToken ? 'REDACTED' : 'NOT FOUND');

      if (!verificationToken) {
        console.error('[AuthController] ❌ No verification token provided');
        return res.status(400).json({
          success: false,
          message: 'Verification token is required',
        });
      }

      console.log('[AuthController] Calling authService.verifyEmail...');
      const result = await authService.verifyEmail(verificationToken);

      res.json({
        success: true,
        message: 'Email verified successfully. Your account has been activated.',
        data: {
          userId: result.userId,
          email: result.email,
        },
      });
    } catch (error) {
      return sendError(res, error, 400, 'Xác thực email thất bại', 'AUTH_VERIFY_EMAIL_FAILED');
    }
  }

  /** IT/HR — provision user (S2S only) */
  async provisionUserInternal(req, res) {
    try {
      const {
        email,
        firstName,
        lastName,
        password,
        systemRole,
        resetPassword,
        readyForLogin,
      } = req.body || {};
      const result = await authService.provisionUserByAdmin({
        email,
        firstName,
        lastName,
        password,
        systemRole,
        resetPassword,
        readyForLogin,
      });
      return res.status(result.created ? 201 : 200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      return sendError(res, error, error.statusCode || 400, 'Không tạo được tài khoản', 'AUTH_PROVISION_FAILED');
    }
  }

  /** Internal — soft rollback: deactivate UserAuth created during import */
  async deprovisionUserInternal(req, res) {
    try {
      const userId = String(req.body?.userId || '').trim();
      if (!userId) {
        return sendError(res, new Error('userId là bắt buộc'), 400, 'userId bắt buộc', 'AUTH_DEPROVISION_REQUIRED');
      }
      const UserAuth = require('../models/UserAuth');
      const updated = await UserAuth.findOneAndUpdate(
        { userId },
        {
          $set: {
            isActive: false,
            isEmailVerified: false,
          },
        },
        { new: true }
      );

      if (!updated) {
        return sendError(res, new Error('UserAuth not found'), 404, 'Không tìm thấy UserAuth', 'AUTH_DEPROVISION_NOT_FOUND');
      }

      return res.json({
        success: true,
        data: { userId: String(updated.userId) },
      });
    } catch (error) {
      return sendError(res, error, 400, 'Không thể deprovision user', 'AUTH_DEPROVISION_FAILED');
    }
  }

  // Lấy thông tin user hiện tại
  async getMe(req, res) {
    try {
      const userId = req.user?.id || req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const UserAuth = require('../models/UserAuth');
      const userAuth = await UserAuth.findOne({ userId })
        .select('systemRole mustChangePassword tokenVersion')
        .lean();

      if (!userAuth) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized',
        });
      }

      const got = Number(req.user?.tv ?? 0);
      const expected = Number(userAuth.tokenVersion || 0);
      if (got !== expected) {
        return res.status(401).json({
          success: false,
          message: 'Token revoked',
          errorCode: 'AUTH_TOKEN_INVALID',
        });
      }

      res.json({
        success: true,
        data: {
          id: userId,
          email: req.user.email,
          systemRole: userAuth?.systemRole || req.user.systemRole || 'employee',
          mustChangePassword: Boolean(userAuth?.mustChangePassword),
        },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không tải được thông tin tài khoản', 'AUTH_ME_FAILED');
    }
  }

  /** S2S — gateway đọc tokenVersion khi Redis cache miss */
  async getTokenVersionInternal(req, res) {
    try {
      const userId = String(req.params.userId || '').trim();
      if (!userId) {
        return res.status(400).json({ success: false, message: 'userId is required' });
      }
      const UserAuth = require('../models/UserAuth');
      const userAuth = await UserAuth.findOne({ userId }).select('tokenVersion').lean();
      if (!userAuth) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }
      return res.json({
        success: true,
        data: { tokenVersion: Number(userAuth.tokenVersion || 0) },
      });
    } catch (error) {
      return sendError(res, error, 500, 'Không đọc được token version', 'AUTH_TOKEN_VERSION_FAILED');
    }
  }

  /** S2S — org-service gửi email mời nhận tài khoản công ty */
  async sendCompanyInviteEmail(req, res) {
    try {
      const { email, inviteUrl, organizationName, firstName, lastName } = req.body || {};
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !normalized.includes('@')) {
        return res.status(400).json({ success: false, message: 'email is required', errorCode: 'VALIDATION_REQUIRED' });
      }
      const url = String(inviteUrl || '').trim();
      if (!url) {
        return res.status(400).json({ success: false, message: 'inviteUrl is required', errorCode: 'VALIDATION_REQUIRED' });
      }
      if (!emailService.isAvailable()) {
        return res.status(503).json({
          success: false,
          message: 'Email service is not configured',
          errorCode: 'AUTH_EMAIL_UNAVAILABLE',
          messageUser: 'Dịch vụ email chưa được cấu hình.',
        });
      }
      const info = await emailService.sendCompanyInviteEmail(normalized, {
        inviteUrl: url,
        organizationName: String(organizationName || '').trim(),
        firstName: String(firstName || '').trim(),
        lastName: String(lastName || '').trim(),
      });
      if (!info) {
        return res.status(503).json({
          success: false,
          message: 'Failed to send invite email',
          errorCode: 'AUTH_INVITE_EMAIL_FAILED',
          messageUser:
            'Không gửi được email mời. Kiểm tra EMAIL_USER / Gmail App Password (lỗi SMTP 535 BadCredentials).',
        });
      }
      return res.json({ success: true, data: { sent: true } });
    } catch (error) {
      return sendError(res, error, 500, 'Không gửi được email mời', 'AUTH_INVITE_EMAIL_FAILED');
    }
  }

  /** S2S — org-service gửi email đặt mật khẩu sau Excel/HR provision */
  async sendProvisionSetPasswordEmail(req, res) {
    try {
      const { userId, frontendUrl, organizationName, firstName, lastName } = req.body || {};
      const uid = String(userId || '').trim();
      if (!uid) {
        return res.status(400).json({
          success: false,
          message: 'userId is required',
          errorCode: 'VALIDATION_REQUIRED',
        });
      }
      const adminUserService = require('../services/adminUser.service');
      const data = await adminUserService.sendProvisionSetPasswordEmail(uid, {
        frontendUrl,
        organizationName,
        firstName,
        lastName,
      });
      return res.json({ success: true, data });
    } catch (error) {
      return sendError(res, error, error.statusCode || 500, 'Không gửi được email đặt mật khẩu', 'AUTH_SET_PASSWORD_EMAIL_FAILED');
    }
  }

  /** Gọi nội bộ từ voice-service — gửi email mời phòng thoại */
  async sendVoiceRoomInviteEmail(req, res) {
    try {
      const { email, inviteUrl, roomId, hostName } = req.body || {};
      const normalized = String(email || '').trim().toLowerCase();
      if (!normalized || !normalized.includes('@')) {
        return res.status(400).json({ success: false, message: 'email is required' });
      }
      const url = String(inviteUrl || '').trim();
      if (!url) {
        return res.status(400).json({ success: false, message: 'inviteUrl is required' });
      }
      const info = await emailService.sendVoiceRoomInviteEmail(normalized, {
        inviteUrl: url,
        roomId: String(roomId || '').trim(),
        hostName: String(hostName || '').trim(),
      });
      if (!info) {
        return res.status(503).json({
          success: false,
          message: 'Email service is not configured',
        });
      }
      return res.json({ success: true, sent: true });
    } catch (error) {
      return sendError(res, error, 500, 'Không gửi được email mời', 'AUTH_VOICE_INVITE_EMAIL_FAILED');
    }
  }
}

module.exports = new AuthController();




