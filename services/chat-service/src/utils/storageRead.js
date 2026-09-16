const firebaseStorage = require('./firebaseStorage');
const objectStorage = require('./objectStorage');

const ALLOWED_PREFIXES = ['temp/', 'tasks/', 'chat/', 'dm/'];

function normalizeStoragePath(storagePath) {
  return String(storagePath || '').trim().replace(/^\/+/, '');
}

function assertAllowedStoragePath(storagePath) {
  const normalizedPath = normalizeStoragePath(storagePath);
  if (!normalizedPath || normalizedPath.includes('..')) {
    const err = new Error('Invalid storagePath');
    err.statusCode = 400;
    throw err;
  }
  if (!ALLOWED_PREFIXES.some((prefix) => normalizedPath.startsWith(prefix))) {
    const err = new Error('storagePath not allowed');
    err.statusCode = 403;
    err.errorCode = 'MESSAGE_FORBIDDEN';
    throw err;
  }
  return normalizedPath;
}

function guessFileNameFromPath(storagePath) {
  const base = String(storagePath || '').split('/').pop() || 'file';
  const idx = base.indexOf('_');
  return idx >= 0 ? base.slice(idx + 1) || base : base;
}

function withUtf8ContentType(mimeType) {
  const mime = String(mimeType || '').trim().split(';')[0].trim();
  if (!mime) return 'application/octet-stream';
  if (mime.startsWith('text/') || mime === 'application/json') {
    return `${mime}; charset=utf-8`;
  }
  return mime;
}

function guessContentTypeFromFileName(fileName) {
  const n = String(fileName || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.txt') || n.endsWith('.md') || n.endsWith('.markdown')) return 'text/plain';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (n.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  return 'application/octet-stream';
}

/**
 * @returns {Promise<{ stream: import('stream').Readable, backend: 'minio' | 'firebase', fileName: string }>}
 */
async function openStorageObjectReadStream(storagePath) {
  const normalizedPath = assertAllowedStoragePath(storagePath);
  const fileName = guessFileNameFromPath(normalizedPath);
  const { isFirebaseBillingOrPermissionError } = require('./storageUpload');

  if (objectStorage.isEnabled() && (await objectStorage.objectExists(normalizedPath))) {
    return {
      stream: await objectStorage.getObjectStream(normalizedPath),
      backend: 'minio',
      fileName,
    };
  }

  if (firebaseStorage.isEnabled()) {
    try {
      const bucket = firebaseStorage.getBucket();
      const file = bucket.file(normalizedPath);
      const [exists] = await file.exists();
      if (exists) {
        return {
          stream: file.createReadStream(),
          backend: 'firebase',
          fileName,
        };
      }
    } catch (err) {
      if (isFirebaseBillingOrPermissionError(err)) {
        const e = new Error(
          objectStorage.isEnabled()
            ? 'File không có trên MinIO và Firebase billing đang tắt — không đọc được object.'
            : 'Kho lưu trữ Firebase tạm ngưng (billing/permission).'
        );
        e.statusCode = 503;
        e.errorCode = 'CHAT_STORAGE_UNAVAILABLE';
        e.messageUser = objectStorage.isEnabled()
          ? 'Không mở được file: bản lưu MinIO không có và Firebase đang tắt billing. Hãy tải lên lại file hoặc bật lại Firebase.'
          : 'Kho lưu trữ Firebase tạm ngưng. Bật MinIO dev hoặc kích hoạt lại billing Firebase.';
        throw e;
      }
      throw err;
    }
  }

  const err = new Error('Object not found');
  err.statusCode = 404;
  err.errorCode = 'MESSAGE_NOT_FOUND';
  throw err;
}

module.exports = {
  ALLOWED_PREFIXES,
  normalizeStoragePath,
  assertAllowedStoragePath,
  guessFileNameFromPath,
  guessContentTypeFromFileName,
  withUtf8ContentType,
  openStorageObjectReadStream,
};
