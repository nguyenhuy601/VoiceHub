const multer = require('multer');
const path = require('path');

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.ico',
  '.avif',
  '.jfif',
  '.pjpeg',
  '.heic',
  '.heif',
]);

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

function resolveExtension(file) {
  const fromName = path.extname(String(file.originalname || '')).toLowerCase();
  if (fromName && ALLOWED_EXTENSIONS.has(fromName)) return fromName;
  const mime = String(file.mimetype || '').toLowerCase();
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime];
  if (mime.startsWith('image/')) return '.jpg';
  return '';
}

const fileFilter = (_req, file, cb) => {
  const ext = resolveExtension(file);
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeOk = mime.startsWith('image/') || mime === 'application/octet-stream';
  if (ext && (mimeOk || mime === '')) {
    return cb(null, true);
  }
  cb(
    new Error(
      'Chỉ chấp nhận ảnh: jpg, jpeg, png, gif, webp, bmp, ico, avif, heic (không hỗ trợ SVG)'
    )
  );
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

module.exports = upload;
module.exports.resolveExtension = resolveExtension;
module.exports.MIME_TO_EXT = MIME_TO_EXT;
