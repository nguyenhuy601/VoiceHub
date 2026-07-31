const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadsDir } = require('../config/uploadsPath');

const cvDir = path.join(uploadsDir, 'cv');

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(cvDir)) {
      fs.mkdirSync(cvDir, { recursive: true });
    }
    cb(null, cvDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeBase = String(file.originalname || 'cv')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 80);
    cb(null, `cv-${uniqueSuffix}-${safeBase.endsWith('.pdf') ? safeBase : `${safeBase}.pdf`}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  const mime = String(file.mimetype || '').toLowerCase();
  const mimeOk =
    mime === 'application/pdf' ||
    mime === 'application/x-pdf' ||
    mime === 'application/octet-stream';
  if (ext === '.pdf' && mimeOk) {
    return cb(null, true);
  }
  cb(new Error('Chỉ chấp nhận file PDF (tối đa 5MB)'));
};

const cvUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});

module.exports = { cvUpload, cvDir };
