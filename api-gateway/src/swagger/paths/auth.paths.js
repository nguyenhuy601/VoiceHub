/**
 * Curated OpenAPI paths — Auth (đầy đủ checklist + examples).
 */

const { buildOperation, pathParam } = require('../components/op.helpers');

module.exports = {
  '/api/auth/login': {
    post: buildOperation({
      operationId: 'login',
      tags: ['Auth'],
      summary: 'Đăng nhập',
      description:
        'Xác thực email/password, trả accessToken (JWT) và refreshToken. Không cần Authorize.',
      public: true,
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginRequest' },
            example: {
              email: 'admin@example.com',
              password: 'SecurePass123!',
            },
          },
        },
      },
      successExample: {
        success: true,
        data: {
          accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          user: { id: '507f1f77bcf86cd799439011', email: 'admin@example.com' },
        },
      },
    }),
  },
  '/api/auth/register': {
    post: buildOperation({
      operationId: 'register',
      tags: ['Auth'],
      summary: 'Đăng ký tài khoản',
      description: 'Tạo user auth mới. Có thể yêu cầu verify email.',
      public: true,
      requireNotFound: false,
      successStatus: 201,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterRequest' },
            example: {
              email: 'user@example.com',
              password: 'SecurePass123!',
              displayName: 'Nguyen Van A',
            },
          },
        },
      },
      successExample: { success: true, data: { userId: '507f1f77bcf86cd799439011' } },
    }),
  },
  '/api/auth/refresh-token': {
    post: buildOperation({
      operationId: 'refreshToken',
      tags: ['Auth'],
      summary: 'Làm mới access token',
      description: 'Đổi refreshToken lấy accessToken mới. Có thể yêu cầu header client.',
      public: true,
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RefreshTokenRequest' },
            example: { refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
          },
        },
      },
      successExample: {
        success: true,
        data: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
    }),
  },
  '/api/auth/logout': {
    post: buildOperation({
      operationId: 'logout',
      tags: ['Auth'],
      summary: 'Đăng xuất',
      description: 'Thu hồi phiên / tăng tokenVersion.',
      requireNotFound: false,
      successExample: { success: true, data: { loggedOut: true } },
    }),
  },
  '/api/auth/me': {
    get: buildOperation({
      operationId: 'getAuthMe',
      tags: ['Auth'],
      summary: 'Profile auth hiện tại',
      description: 'Trả user gắn JWT sau Authorize.',
      requireNotFound: false,
      successExample: {
        success: true,
        data: { id: '507f1f77bcf86cd799439011', email: 'admin@example.com' },
      },
    }),
  },
  '/api/auth/forgot-password': {
    post: buildOperation({
      operationId: 'forgotPassword',
      tags: ['Auth'],
      summary: 'Quên mật khẩu',
      description: 'Gửi email reset password nếu email tồn tại.',
      public: true,
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email', example: 'user@example.com' },
              },
            },
            example: { email: 'user@example.com' },
          },
        },
      },
      successExample: { success: true, message: 'If the email exists, a reset link was sent' },
    }),
  },
  '/api/auth/reset-password': {
    post: buildOperation({
      operationId: 'resetPassword',
      tags: ['Auth'],
      summary: 'Đặt lại mật khẩu',
      description: 'Dùng token từ email reset.',
      public: true,
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password'],
              properties: {
                token: { type: 'string', example: 'reset-token' },
                password: { type: 'string', format: 'password', minLength: 8, example: 'NewPass123!' },
              },
            },
          },
        },
      },
      successExample: { success: true },
    }),
  },
  '/api/auth/verify-email': {
    get: buildOperation({
      operationId: 'verifyEmail',
      tags: ['Auth'],
      summary: 'Xác minh email',
      description: 'GET với query `token` — không dùng JWT.',
      public: true,
      requireNotFound: false,
      parameters: [
        {
          name: 'token',
          in: 'query',
          required: true,
          description: 'Token verify email',
          schema: { type: 'string', example: 'verify-token' },
        },
      ],
      successExample: { success: true, message: 'Email verified' },
    }),
  },
  '/api/auth/admin/users/{userId}/summary': {
    get: buildOperation({
      operationId: 'getAdminUserSummary',
      tags: ['Auth'],
      summary: 'Company admin — user account summary',
      description: 'Tóm tắt tài khoản user (lock, verify…). Yêu cầu org admin.',
      parameters: [pathParam('userId', 'User id')],
      successExample: { success: true, data: { userId: '507f1f77bcf86cd799439011', locked: false } },
    }),
  },
};
