import apiClient from '../../services/api/apiClient';
import { createTranslator } from '../../locales/buildStrings';

function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  return '';
}

function putFileWithProgress(url, file, contentType, onProgress, tr) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && typeof onProgress === 'function') {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(tr('taskBoard.errorUploadFailed', { status: xhr.status })));
    };
    xhr.onerror = () => reject(new Error(tr('taskBoard.errorUploadNetwork')));
    xhr.send(file);
  });
}

/**
 * Upload file đính kèm thẻ (Firebase signed URL — cùng luồng chat org_room).
 * @returns {{ name: string, url: string, storagePath?: string, mimeType?: string }}
 */
export async function uploadTaskBoardAttachment(file, onProgress, { t, locale = 'vi' } = {}) {
  const tr = typeof t === 'function' ? t : createTranslator(locale);

  if (!file) throw new Error(tr('taskBoard.errorNoFile'));
  const resolvedMime = file.type || guessMimeFromFileName(file.name) || 'application/octet-stream';

  onProgress?.(5);
  const signedRes = await apiClient.post('/messages/storage/signed-upload', {
    fileName: file.name,
    mimeType: resolvedMime,
    size: file.size,
    retentionContext: 'org_room',
  });
  const payload = signedRes?.data ?? signedRes;
  const data = payload?.data ?? payload;
  if (!data?.uploadUrl || !data?.storagePath) {
    throw new Error(payload?.message || tr('taskBoard.errorMissingUploadUrl'));
  }

  onProgress?.(15);
  await putFileWithProgress(data.uploadUrl, file, resolvedMime, (pct) => {
    onProgress?.(15 + Math.round((pct / 100) * 80));
  }, tr);
  onProgress?.(100);

  return {
    name: file.name,
    url: String(data.storagePath),
    storagePath: String(data.storagePath),
    mimeType: resolvedMime,
  };
}
