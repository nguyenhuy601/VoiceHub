const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { verifyAccessToken } = require('../config/jwt');
const internalGatewayAuth = require('@enterprise/shared/middleware/internalGatewayAuth');
const { sendServiceError } = require('../middleware/sendServiceError');

// Middleware xác thực
const authenticate = (req, res, next) => {
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

// Public routes
router.post('/register', authController.register.bind(authController));
router.post('/login', authController.login.bind(authController));
router.post('/refresh-token', authController.refreshToken.bind(authController));
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

module.exports = router;




