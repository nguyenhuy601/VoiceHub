/**
 * Hiển thị / tải file đính kèm task board & chat (blob từ storage proxy).
 */

function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (n.endsWith('.doc')) return 'application/msword';
  if (n.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (n.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (n.endsWith('.pptx')) {
    return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
  }
  if (n.endsWith('.ppt')) return 'application/vnd.ms-powerpoint';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.zip')) return 'application/zip';
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.md')) return 'text/markdown';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.txt')) return 'text/plain';
  if (n.endsWith('.html') || n.endsWith('.htm')) return 'text/html';
  if (n.endsWith('.mp4')) return 'video/mp4';
  if (n.endsWith('.webm')) return 'video/webm';
  if (n.endsWith('.mp3')) return 'audio/mpeg';
  if (n.endsWith('.wav')) return 'audio/wav';
  return '';
}

/**
 * @param {{ mimeType?: string, name?: string }} meta
 * @param {string} [storagePath]
 */
export function resolveAttachmentContentType(meta, storagePath) {
  const fromMeta = String(meta?.mimeType || '').trim();
  if (fromMeta && fromMeta !== 'application/octet-stream') return fromMeta;

  const fromName = guessMimeFromFileName(meta?.name);
  if (fromName) return fromName;

  const pathTail = String(storagePath || '').split('/').filter(Boolean).pop() || '';
  const fromPath = guessMimeFromFileName(pathTail);
  if (fromPath) return fromPath;

  return fromMeta || 'application/octet-stream';
}

/** Bọc lại blob với MIME đúng khi server/proxy trả application/octet-stream. */
export function ensureTypedBlob(blob, contentType) {
  if (!(blob instanceof Blob)) {
    throw new Error('Expected Blob response');
  }

  const resolved = String(contentType || '').trim() || 'application/octet-stream';
  const baseResolved = resolved.split(';')[0].trim().toLowerCase();
  const baseExisting = String(blob.type || '').split(';')[0].trim().toLowerCase();

  if (
    baseExisting
    && baseExisting !== 'application/octet-stream'
    && baseExisting === baseResolved
  ) {
    return blob;
  }

  return new Blob([blob], { type: resolved });
}

/** MIME có thể mở tab mới thay vì ép tải xuống. */
export function shouldOpenAttachmentInline(contentType) {
  const base = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!base) return false;
  if (base.startsWith('image/')) return true;
  if (base.startsWith('text/')) return true;
  if (base === 'application/pdf') return true;
  if (base === 'application/json') return true;
  if (base.startsWith('audio/') || base.startsWith('video/')) return true;
  return false;
}

export function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = String(fileName || 'download').trim() || 'download';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
