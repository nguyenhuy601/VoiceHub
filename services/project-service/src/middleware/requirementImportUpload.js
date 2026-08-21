const multer = require('multer');
const { MAX_FILE_BYTES } = require('../constants/requirementTemplate.constants');

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

module.exports = { requirementImportUpload };
