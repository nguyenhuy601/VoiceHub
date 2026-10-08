/**
 * Multipart upload schemas.
 */

const UploadAvatarMultipart = {
  type: 'object',
  required: ['avatar'],
  description:
    'Upload avatar. Accepted: image/jpeg, png, gif, webp, bmp, heic… Max ~5MB (multer limits). Field name: `avatar`.',
  properties: {
    avatar: {
      type: 'string',
      format: 'binary',
      description: 'File ảnh đại diện',
    },
  },
};

const UploadCapabilityCvMultipart = {
  type: 'object',
  required: ['file'],
  description: 'Upload CV. Field name: `file`. PDF/DOC; max size theo user-service cvUpload.',
  properties: {
    file: {
      type: 'string',
      format: 'binary',
      description: 'File CV',
    },
  },
};

module.exports = {
  UploadAvatarMultipart,
  UploadCapabilityCvMultipart,
};
