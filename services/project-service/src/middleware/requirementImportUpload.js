const multer = require('multer');
const { MAX_FILE_BYTES } = require('../constants/requirementTemplate.constants');
const { isXlsxZipMagic } = require('../utils/requirement/xlsxMagicByte');
const { sendServiceError } = require('./sendServiceError');

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

function fileFilter(_req, file, cb) {
  const name = String(file?.originalname || '').toLowerCase();
  const extOk = name.endsWith('.xlsx');
  const mimeOk = ALLOWED_MIME.has(String(file?.mimetype || '').toLowerCase());
  if (!extOk || !mimeOk) {
    const err = new Error('Chỉ chấp nhận file .xlsx');
    err.statusCode = 400;
    err.errorCode = 'REQ_IMPORT_INVALID_FILE';
    return cb(err);
  }
  return cb(null, true);
}

const requirementImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter,
});

/**
 * After multer.single('file'): reject buffers that are not ZIP/OOXML.
 */
function assertXlsxMagicByte(req, res, next) {
  const buf = req.file?.buffer;
  if (!buf) {
    return sendServiceError(res, 400, {
      errorCode: 'REQ_IMPORT_FILE_REQUIRED',
      messageUser: 'file (.xlsx) bắt buộc',
      message: 'file (.xlsx) bắt buộc',
    });
  }
  if (!isXlsxZipMagic(buf)) {
    return sendServiceError(res, 400, {
      errorCode: 'REQ_IMPORT_FILE_INVALID',
      messageUser: 'File không phải .xlsx hợp lệ.',
      message: 'Invalid xlsx magic',
    });
  }
  return next();
}

module.exports = {
  requirementImportUpload,
  assertXlsxMagicByte,
};
