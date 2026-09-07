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

// Internal — rollback helper for Excel/seed import
router.post(
  '/internal/deprovision',
  internalGatewayAuth,
  authController.deprovisionUserInternal.bind(authController)
);

router.post(
  '/internal/company-invite-email',
  internalGatewayAuth,
  authController.sendCompanyInviteEmail.bind(authController)
);

router.post(
  '/internal/provision-set-password-email',
  internalGatewayAuth,
  authController.sendProvisionSetPasswordEmail.bind(authController)
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

// Company admin — account actions (JWT + org admin at service).
function mountCompanyUserAccountRoutes() {
  const pathPrefix = '/users';
  const hrAuth = [authenticate, companyAdminAuth({ requireFullAccess: false })];
  const fullAuth = [authenticate, companyAdminAuth({ requireFullAccess: true })];
  const bind = (fn) => fn.bind(adminUserController);

  router.get(`${pathPrefix}/:userId/summary`, ...hrAuth, bind(adminUserController.getSummary));
  router.post(`${pathPrefix}/:userId/lock`, ...fullAuth, bind(adminUserController.lockUser));
  router.post(
    `${pathPrefix}/:userId/force-password`,
    ...fullAuth,
    bind(adminUserController.forcePasswordChange)
  );
  router.post(
    `${pathPrefix}/:userId/reset-password`,
    ...fullAuth,
    bind(adminUserController.triggerPasswordReset)
  );
  router.get(
    `${pathPrefix}/:userId/login-events`,
    ...hrAuth,
    bind(adminUserController.listLoginEvents)
  );
  router.post(
    `${pathPrefix}/:userId/revoke-sessions`,
    ...fullAuth,
    bind(adminUserController.revokeSessions)
  );
  router.post(
    `${pathPrefix}/:userId/set-password`,
    ...fullAuth,
    bind(adminUserController.setPassword)
  );
  router.post(
    `${pathPrefix}/:userId/activate`,
    ...fullAuth,
    bind(adminUserController.activatePending)
  );
  router.post(
    `${pathPrefix}/:userId/resend-verification`,
    ...fullAuth,
    bind(adminUserController.resendVerification)
  );
}

mountCompanyUserAccountRoutes();

module.exports = router;




