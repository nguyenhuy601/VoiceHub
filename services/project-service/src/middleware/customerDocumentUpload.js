const multer = require('multer');
const {
  CUSTOMER_DOC_MAX_BYTES,
  ALLOWED_EXTENSIONS,
} = require('../utils/analysis/customerDocumentStorage');

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/markdown',
  'text/csv',
  'image/png',
  'image/jpeg',
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);

function fileFilter(_req, file, cb) {
  const name = String(file?.originalname || '').toLowerCase();
  const extOk = ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
  const mimeOk = ALLOWED_MIME.has(String(file?.mimetype || '').toLowerCase());
  if (!extOk || !mimeOk) {
    const err = new Error('Định dạng file không được chấp nhận');
    err.statusCode = 400;
    err.errorCode = 'REQ_DOC_INVALID_FILE';
    return cb(err);
  }
  return cb(null, true);
}

const customerDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CUSTOMER_DOC_MAX_BYTES, files: 1 },
  fileFilter,
});

module.exports = { customerDocumentUpload, ALLOWED_MIME, fileFilter };
