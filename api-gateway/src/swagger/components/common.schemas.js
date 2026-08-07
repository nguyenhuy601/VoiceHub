/**
 * Shared OpenAPI schemas — ApiSuccess/Error, validation.
 */

const ValidationFieldError = {
  type: 'object',
  required: ['field', 'message'],
  properties: {
    field: {
      type: 'string',
      description: 'Tên field lỗi',
      example: 'email',
    },
    message: {
      type: 'string',
      description: 'Validation message',
      example: 'must be a valid email',
    },
  },
};

const ApiSuccess = {
  type: 'object',
  required: ['success'],
  description: 'Generic success envelope',
  properties: {
    success: {
      type: 'boolean',
      description: 'Luôn true khi thành công',
      example: true,
    },
    data: {
      description: 'Payload theo endpoint (object hoặc array)',
      example: {},
    },
    message: {
      type: 'string',
      description: 'Thông báo tùy chọn',
      example: 'OK',
    },
  },
};

const ApiError = {
  type: 'object',
  required: ['success', 'message'],
  description: 'Error envelope (shared/middleware/httpErrorResponse)',
  properties: {
    success: {
      type: 'boolean',
      description: 'Luôn false khi lỗi',
      example: false,
    },
    message: {
      type: 'string',
      description: 'Message kỹ thuật (ẩn chi tiết 5xx)',
      example: 'Request failed',
    },
    errorCode: {
      type: 'string',
      description: 'Mã lỗi ERROR_CATALOG',
      example: 'VALIDATION_REQUIRED',
    },
    messageUser: {
      type: 'string',
      description: 'Thông báo hiển thị UI',
      example: 'Dữ liệu không hợp lệ.',
    },
  },
};

const ValidationErrorBody = {
  allOf: [
    { $ref: '#/components/schemas/ApiError' },
    {
      type: 'object',
      properties: {
        errors: {
          type: 'array',
          description: 'Chi tiết lỗi từng field (khi validation fail)',
          items: { $ref: '#/components/schemas/ValidationFieldError' },
          example: [{ field: 'email', message: 'must be a valid email' }],
        },
      },
    },
  ],
};

const MembershipRole = {
  type: 'string',
  description: 'Organization membership role\n- member: thành viên\n- hr: HR\n- admin: quản trị org\n- owner: chủ sở hữu',
  enum: ['member', 'hr', 'admin', 'owner'],
  example: 'member',
};

const MongoObjectId = {
  type: 'string',
  description: 'MongoDB ObjectId (24 hex)',
  pattern: '^[a-fA-F0-9]{24}$',
  example: '507f1f77bcf86cd799439011',
};

module.exports = {
  ValidationFieldError,
  ApiSuccess,
  ApiError,
  ValidationErrorBody,
  MembershipRole,
  MongoObjectId,
};
