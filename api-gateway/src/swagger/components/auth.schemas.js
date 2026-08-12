/**
 * Auth request/response DTOs.
 */

const LoginRequest = {
  type: 'object',
  required: ['email', 'password'],
  description: 'Body đăng nhập',
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email tài khoản',
      example: 'admin@example.com',
    },
    password: {
      type: 'string',
      format: 'password',
      description: 'Mật khẩu',
      minLength: 1,
      example: 'SecurePass123!',
    },
  },
  example: {
    email: 'admin@example.com',
    password: 'SecurePass123!',
  },
};

const RegisterRequest = {
  type: 'object',
  required: ['email', 'password'],
  description: 'Body đăng ký',
  properties: {
    email: {
      type: 'string',
      format: 'email',
      description: 'Email mới',
      example: 'user@example.com',
    },
    password: {
      type: 'string',
      format: 'password',
      description: 'Mật khẩu (min 8 tùy policy)',
      minLength: 8,
      example: 'SecurePass123!',
    },
    displayName: {
      type: 'string',
      description: 'Tên hiển thị (optional)',
      example: 'Nguyen Van A',
    },
  },
};

const RefreshTokenRequest = {
  type: 'object',
  required: ['refreshToken'],
  properties: {
    refreshToken: {
      type: 'string',
      description: 'Refresh token từ login',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    },
  },
};

const AuthTokenData = {
  type: 'object',
  description: 'Payload token sau login/refresh',
  properties: {
    accessToken: {
      type: 'string',
      description: 'JWT access — dùng Bearer Authorize',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    },
    refreshToken: {
      type: 'string',
      description: 'Refresh token',
      example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    },
    user: {
      type: 'object',
      description: 'Thông tin user rút gọn',
      additionalProperties: true,
    },
  },
};

module.exports = {
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  AuthTokenData,
};
