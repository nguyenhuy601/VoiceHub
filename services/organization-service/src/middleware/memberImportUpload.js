const multer = require('multer');

const storage = multer.memoryStorage();

const ALLOWED_MIME = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // some browsers
]);

function fileFilter(_req, file, cb) {
  const name = String(file?.originalname || '').toLowerCase();
  const extOk = name.endsWith('.xlsx');
  const mimeOk = ALLOWED_MIME.has(String(file?.mimetype || '').toLowerCase());
  if (!extOk || !mimeOk) {
    const err = new Error('Chỉ chấp nhận file .xlsx');
    err.statusCode = 400;
    err.errorCode = 'RESOURCE_IMPORT_INVALID_FILE';
    return cb(err);
  }
  return cb(null, true);
}

const memberImportUpload = multer({
  storage,
  limits: {
    fileSize: Number(process.env.MEMBER_IMPORT_XLSX_MAX_BYTES || 5 * 1024 * 1024),
    files: 1,
  },
  fileFilter,
});

module.exports = {
  memberImportUpload,
};

