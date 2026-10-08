const crypto = require('crypto');
const { baseMimeType, isMimeDenied } = require('../config/fileRetention');

/** XML có thể nhúng XHTML/script khi render inline — chỉ phục vụ dạng tải xuống. */
const EXTRA_RISKY_INLINE_MIME = Object.freeze(['text/xml', 'application/xml']);

const STORAGE_READ = Object.freeze({
  ALLOW: 'allow',
  DENY: 'deny',
  ALLOW_UNLINKED: 'allow_unlinked',
});

/**
 * Mặc định bật (secure). Tắt bằng CHAT_STORAGE_READ_STRICT=0|false|off|no.
 */
function isStorageReadStrict() {
  const raw = process.env.CHAT_STORAGE_READ_STRICT;
  if (raw == null || String(raw).trim() === '') return true;
  const v = String(raw).trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'off' || v === 'no') return false;
  return v === '1' || v === 'true' || v === 'on' || v === 'yes';
}

function isOwnTempPath(storagePath, userId) {
  const uid = String(userId || '').trim();
  if (!uid) return false;
  return String(storagePath || '').startsWith(`temp/${uid}/`);
}

/**
 * Quyết định đọc object storage (thuần — controller truyền kết quả query + ACL).
 * - temp/<chính mình>/… → allow
 * - gắn tin nhắn → allow nếu đọc được tin, ngược lại deny
 * - không gắn tin (file task/tài liệu/temp người khác) → strict ? deny : allow_unlinked
 */
function decideStorageRead({ storagePath, userId, linkedMessage, canAccessLinked, strict }) {
  if (isOwnTempPath(storagePath, userId)) return STORAGE_READ.ALLOW;
  if (linkedMessage) {
    return canAccessLinked ? STORAGE_READ.ALLOW : STORAGE_READ.DENY;
  }
  return strict ? STORAGE_READ.DENY : STORAGE_READ.ALLOW_UNLINKED;
}

function isRiskyInlineMime(mimeType) {
  const base = baseMimeType(mimeType);
  return isMimeDenied(base) || EXTRA_RISKY_INLINE_MIME.includes(base);
}

function headerSafeFileName(fileName) {
  return String(fileName || 'file').replace(/["\r\n\\]/g, '_');
}

/**
 * Header an toàn khi phục vụ file cùng origin app: nosniff + CSP sandbox (script không chạy
 * kể cả khi trình duyệt render), MIME rủi ro → attachment.
 */
function buildDownloadHeaders({ mimeType, fileName, contentType }) {
  const disposition = isRiskyInlineMime(mimeType) ? 'attachment' : 'inline';
  return {
    'Content-Type': contentType || baseMimeType(mimeType) || 'application/octet-stream',
    'Content-Disposition': `${disposition}; filename="${headerSafeFileName(fileName)}"`,
    'Cache-Control': 'private, max-age=60',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': 'sandbox',
  };
}

function hashUserIdForLog(userId) {
  return crypto.createHash('sha256').update(String(userId || '')).digest('hex').slice(0, 12);
}

function storagePathPrefixForLog(storagePath) {
  return String(storagePath || '').split('/')[0] || '';
}

module.exports = {
  STORAGE_READ,
  isStorageReadStrict,
  isOwnTempPath,
  decideStorageRead,
  isRiskyInlineMime,
  buildDownloadHeaders,
  hashUserIdForLog,
  storagePathPrefixForLog,
};
