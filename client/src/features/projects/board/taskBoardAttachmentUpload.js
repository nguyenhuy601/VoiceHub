import apiClient from '../../../services/api/apiClient';
import { createTranslator } from '../../../locales/buildStrings';
import { resolveTaskAttachmentMime } from './taskBoardAttachmentMime';

/**
 * Upload file đính kèm thẻ qua proxy same-origin (/messages/storage/upload).
 * Tránh PUT trực tiếp lên GCS/Firebase (403 CORS / Content-Type mismatch trên voicehub.local).
 * @returns {{ name: string, url: string, storagePath?: string, mimeType?: string }}
 */
export async function uploadTaskBoardAttachment(file, onProgress, { t, locale = 'vi' } = {}) {
  const tr = typeof t === 'function' ? t : createTranslator(locale);

  if (!file) throw new Error(tr('taskBoard.errorNoFile'));
  const resolvedMime = resolveTaskAttachmentMime(file);
  if (!resolvedMime) {
    throw new Error(tr('taskBoard.errorMimeNotAllowed'));
  }

  onProgress?.(5);
  const payload = await apiClient.post('/messages/storage/upload', file, {
    headers: {
      'Content-Type': resolvedMime,
      'X-File-Name': encodeURIComponent(file.name),
      'X-Mime-Type': resolvedMime,
      'X-Retention-Context': 'org_room',
    },
    onUploadProgress: (event) => {
      if (event.total && typeof onProgress === 'function') {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
    transformRequest: [(data) => data],
  });
  const data = payload?.data ?? payload;
  if (!data?.storagePath) {
    throw new Error(payload?.message || tr('taskBoard.errorMissingUploadUrl'));
  }

  onProgress?.(100);

  return {
    name: file.name,
    storagePath: String(data.storagePath),
    storageBackend: data.storageBackend || undefined,
    mimeType: resolvedMime,
  };
}

export { guessMimeFromFileName, resolveTaskAttachmentMime } from './taskBoardAttachmentMime';
