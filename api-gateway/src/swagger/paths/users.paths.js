/**
 * Curated — User profile + uploads.
 */

const { buildOperation } = require('../components/op.helpers');

module.exports = {
  '/api/users/me': {
    get: buildOperation({
      operationId: 'getCurrentUserProfile',
      tags: ['Users'],
      summary: 'Get current user profile',
      description: 'Hồ sơ user từ JWT.',
      requireNotFound: false,
      successExample: {
        success: true,
        data: {
          id: '507f1f77bcf86cd799439011',
          displayName: 'Nguyen Van A',
          email: 'user@example.com',
        },
      },
    }),
  },
  '/api/users/avatar': {
    post: buildOperation({
      operationId: 'uploadUserAvatar',
      tags: ['Users'],
      summary: 'Upload avatar',
      description:
        'multipart/form-data field `avatar`. Accepted: jpeg/png/gif/webp/bmp/heic/ico/avif. Max ~5MB (multer).',
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: { $ref: '#/components/schemas/UploadAvatarMultipart' },
          },
        },
      },
      successExample: {
        success: true,
        data: { avatarUrl: '/uploads/avatar-123.jpg' },
      },
    }),
  },
  '/api/users/me/capability/cv': {
    post: buildOperation({
      operationId: 'uploadCapabilityCv',
      tags: ['Users'],
      summary: 'Upload capability CV',
      description: 'multipart/form-data field `file` (PDF/DOC). Max size theo cvUpload middleware.',
      requireNotFound: false,
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file'],
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description: 'CV file (PDF/DOC)',
                },
              },
            },
          },
        },
      },
      successExample: { success: true, data: { cvUrl: '...' } },
    }),
  },
};
