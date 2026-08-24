const firebaseStorage = require('./firebaseStorage');
const objectStorage = require('./objectStorage');

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

  if (mode === 'minio' || (mode === 'auto' && objectStorage.isEnabled())) {
    try {
      await objectStorage.putObject(storagePath, buffer, contentType);
      return { storagePath, storageBackend: 'minio' };
    } catch (minioErr) {
      if (mode === 'minio' || !firebaseStorage.isEnabled()) {
        const err = new Error(
          minioErr?.message || 'MinIO upload failed — kiểm tra MinIO đã chạy (compose extra).'
        );
        err.statusCode = 503;
        err.messageUser =
          'Kho MinIO chưa sẵn sàng. Chạy: docker compose -f docker-compose.swarm-extra.yml --env-file .env up -d minio minio-init';
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
      if (objectStorage.isEnabled() && (mode === 'auto' || isFirebaseBillingOrPermissionError(err))) {
        await objectStorage.putObject(storagePath, buffer, contentType);
        return { storagePath, storageBackend: 'minio' };
      }
      throw err;
    }
  }

  if (objectStorage.isEnabled()) {
    await objectStorage.putObject(storagePath, buffer, contentType);
    return { storagePath, storageBackend: 'minio' };
  }

  const err = new Error('No file storage backend is configured');
  err.statusCode = 503;
  err.messageUser = 'Kho lưu trữ file chưa được cấu hình trên server.';
  throw err;
}

module.exports = {
  uploadBuffer,
  isFirebaseBillingOrPermissionError,
};
