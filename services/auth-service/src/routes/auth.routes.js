const express = require('express');
const router = express.Router();
const cookieParser = require('cookie-parser');
const authController = require('../controllers/auth.controller');
const { verifyAccessToken } = require('../config/jwt');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const { sendServiceError } = require('../middleware/sendServiceError');
const { adminUserController, internalAuthSummaryBatch } = require('../controllers/adminUser.controller');
const { companyAdminAuth } = require('../middleware/companyAdminAuth');
const requireClientHeader = require('../middleware/requireClientHeader');
const UserAuth = require('../models/UserAuth');

router.use(cookieParser());

// Middleware xác thực — verify JWT + tokenVersion (tv) khớp MongoDB
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_NO_TOKEN',
        messageUser: 'Vui lòng đăng nhập lại.',
        message: 'No token provided',
      });
    }

    const decoded = verifyAccessToken(token);
    const userId = String(decoded.id || decoded.userId || decoded._id || '').trim();
    if (!userId) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_TOKEN_INVALID',
        messageUser: 'Phiên đăng nhập không hợp lệ.',
        message: 'Invalid token payload',
      });
    }

    const userAuth = await UserAuth.findOne({ userId }).select('tokenVersion').lean();
    if (!userAuth) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_TOKEN_INVALID',
        messageUser: 'Phiên đăng nhập không hợp lệ.',
        message: 'User not found',
      });
    }

    const expected = Number(userAuth.tokenVersion || 0);
    const got = Number(decoded.tv ?? 0);
    if (got !== expected) {
      return sendServiceError(res, 401, {
        errorCode: 'AUTH_TOKEN_INVALID',
        messageUser: 'Phiên đăng nhập không hợp lệ.',
        message: 'Token revoked',
      });
    }

    req.user = decoded;
    next();
  } catch (error) {
    const isExpired = String(error?.message || '').toLowerCase().includes('expired');
    return sendServiceError(res, 401, {
      errorCode: isExpired ? 'AUTH_TOKEN_EXPIRED' : 'AUTH_TOKEN_INVALID',
      messageUser: isExpired ? 'Phiên đăng nhập đã hết hạn.' : 'Phiên đăng nhập không hợp lệ.',
      message: 'Invalid or expired token',
    });
  }
};

// Internal — voice-service gửi email mời phòng
router.post(
  '/internal/voice-room-invite',
  internalGatewayAuth,
  authController.sendVoiceRoomInviteEmail.bind(authController)
);

router.post(
  '/internal/provision',
  internalGatewayAuth,
  authController.provisionUserInternal.bind(authController)
);

router.post(
  '/internal/company-invite-email',
  internalGatewayAuth,
  authController.sendCompanyInviteEmail.bind(authController)
);

router.get(
  '/internal/token-version/:userId',
  internalGatewayAuth,
  authController.getTokenVersionInternal.bind(authController)
);

router.post('/internal/users-auth-summary', internalGatewayAuth, internalAuthSummaryBatch);

// Public routes — OpenAPI SSOT: api-gateway/src/swagger/paths/*.paths.js (+ scan stubs)
router.post('/login', authController.login.bind(authController));
router.post('/register', authController.register.bind(authController));
router.post('/refresh-token', requireClientHeader(), authController.refreshToken.bind(authController));

router.post('/forgot-password', authController.forgotPassword.bind(authController));
router.post('/resend-verification', authController.resendVerification.bind(authController));
router.post('/reset-password', authController.resetPassword.bind(authController));
// Verify email: GET với token trong query string, KHÔNG dùng JWT
router.get('/verify-email', authController.verifyEmail.bind(authController));
router.get('/verify-email-change', authController.verifyEmailChange.bind(authController));

// Protected routes
router.post('/logout', authenticate, authController.logout.bind(authController));
router.post('/change-password', authenticate, authController.changePassword.bind(authController));
router.post('/change-email/request', authenticate, authController.requestEmailChange.bind(authController));
router.get('/me', authenticate, authController.getMe.bind(authController));

// Company admin — user account management (JWT + org admin check at service)
router.get(
  '/admin/users/:userId/summary',
  authenticate,
  companyAdminAuth({ requireFullAccess: false }),
  adminUserController.getSummary.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/lock',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.lockUser.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/force-password',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.forcePasswordChange.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/reset-password',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.triggerPasswordReset.bind(adminUserController)
);
router.get(
  '/admin/users/:userId/login-events',
  authenticate,
  companyAdminAuth({ requireFullAccess: false }),
  adminUserController.listLoginEvents.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/revoke-sessions',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.revokeSessions.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/set-password',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.setPassword.bind(adminUserController)
);
router.post(
  '/admin/users/:userId/resend-verification',
  authenticate,
  companyAdminAuth({ requireFullAccess: true }),
  adminUserController.resendVerification.bind(adminUserController)
);

module.exports = router;




