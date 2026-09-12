const firebaseStorage = require('./firebaseStorage');
const objectStorage = require('./objectStorage');
const logger = require('@enterprise/shared/utils/logger');

function isFirebaseBillingOrPermissionError(err) {
  const code = Number(err?.code);
  const msg = String(err?.message || '').toLowerCase();
  return (
    code === 403 ||
    msg.includes('billing account') ||
    msg.includes('billing') && msg.includes('disabled') ||
    msg.includes('permission') ||
    msg.includes('forbidden')
  );
}

function resolveUploadMode() {
  return String(process.env.CHAT_UPLOAD_STORAGE || 'auto').trim().toLowerCase();
}

/**
 * Upload buffer — mode minio: chỉ MinIO; auto: ưu tiên MinIO nếu bật (dev), else Firebase + fallback.
 * @returns {Promise<{ storagePath: string, storageBackend: 'firebase' | 'minio' }>}
 */
async function uploadBuffer(storagePath, buffer, contentType) {
  const mode = resolveUploadMode();
  let lastErr = null;

  if (mode === 'minio' || (mode === 'auto' && objectStorage.isEnabled())) {
    try {
      await objectStorage.putObject(storagePath, buffer, contentType);
      return { storagePath, storageBackend: 'minio' };
    } catch (minioErr) {
      lastErr = minioErr;
      logger.warn('[storageUpload] MinIO put failed', {
        message: minioErr?.message,
        code: minioErr?.code || minioErr?.name,
        path: storagePath,
      });
      if (mode === 'minio' || !firebaseStorage.isEnabled()) {
        const err = new Error(
          minioErr?.message || 'MinIO upload failed — kiểm tra MinIO đã chạy (compose extra).'
        );
        err.statusCode = 503;
        err.messageUser =
          'Kho lưu trữ file chưa sẵn sàng. Thử lại sau vài giây hoặc bật MinIO (compose extra).';
        throw err;
      }
      /* auto + MinIO lỗi: thử Firebase */
    }
  }

  if (firebaseStorage.isEnabled() && mode !== 'minio') {
    try {
      await firebaseStorage.uploadObjectBuffer(storagePath, buffer, contentType);
      return { storagePath, storageBackend: 'firebase' };
    } catch (err) {
      lastErr = err;
      logger.warn('[storageUpload] Firebase put failed', {
        message: err?.message,
        code: err?.code,
        path: storagePath,
      });
      if (objectStorage.isEnabled() && (mode === 'auto' || isFirebaseBillingOrPermissionError(err))) {
        try {
          await objectStorage.putObject(storagePath, buffer, contentType);
          return { storagePath, storageBackend: 'minio' };
        } catch (minioRetryErr) {
          lastErr = minioRetryErr;
        }
      }
    }
  }

  if (objectStorage.isEnabled() && mode !== 'minio') {
    try {
      await objectStorage.putObject(storagePath, buffer, contentType);
      return { storagePath, storageBackend: 'minio' };
    } catch (err) {
      lastErr = err;
    }
  }

  const err = new Error(
    lastErr?.message || 'No file storage backend is configured or all backends failed'
  );
  err.statusCode = 503;
  err.messageUser =
    'Kho lưu trữ file tạm ngưng (MinIO/Firebase). Kiểm tra MinIO compose extra hoặc cấu hình Firebase.';
  err.cause = lastErr;
  throw err;
}

module.exports = {
  uploadBuffer,
  isFirebaseBillingOrPermissionError,
};
