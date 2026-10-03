const path = require('path');

const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jfif': 'image/jpeg',
  '.pjpeg': 'image/jpeg',
};

/**
 * @param {string} userId
 * @param {string} [ext] — gồm dấu chấm, ví dụ `.jpg`
 * @returns {string} MinIO object key
 */
function buildAvatarKey(userId, ext = '.jpg') {
  const uid = String(userId || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '');
  if (!uid) {
    throw new Error('userId required for avatar key');
  }
  let normalizedExt = String(ext || '.jpg').toLowerCase();
  if (!normalizedExt.startsWith('.')) normalizedExt = `.${normalizedExt}`;
  if (!/^\.[a-z0-9]+$/.test(normalizedExt)) normalizedExt = '.jpg';
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `users/${uid}/avatars/${unique}${normalizedExt}`;
}

function isLegacyUploadsPath(avatar) {
  const raw = String(avatar || '').trim();
  if (!raw) return false;
  return /^\/?uploads\//i.test(raw);
}

function isMinioAvatarKey(avatar) {
  const raw = String(avatar || '').trim();
  if (!raw) return false;
  return /^users\/[^/]+\/avatars\//i.test(raw);
}

function contentTypeFromAvatarPath(avatar) {
  const raw = String(avatar || '').trim();
  const ext = path.extname(raw.split('?')[0] || '').toLowerCase();
  return EXT_TO_MIME[ext] || 'application/octet-stream';
}

function legacyDiskFileName(avatar) {
  const rel = String(avatar || '')
    .replace(/^\/uploads\//i, '')
    .replace(/^uploads\//i, '');
  return path.basename(rel);
}

module.exports = {
  buildAvatarKey,
  isLegacyUploadsPath,
  isMinioAvatarKey,
  contentTypeFromAvatarPath,
  legacyDiskFileName,
  EXT_TO_MIME,
};
