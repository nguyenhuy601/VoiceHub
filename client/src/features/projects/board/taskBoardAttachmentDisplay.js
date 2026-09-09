import { guessMimeFromFileName } from './taskBoardAttachmentMime.js';

function withUtf8Charset(mimeType) {
  const mime = String(mimeType || '').trim();
  if (!mime) return 'application/octet-stream';
  if (mime.startsWith('text/') && !mime.includes('charset=')) {
    return `${mime}; charset=utf-8`;
  }
  return mime;
}

/** @param {{ name?: string, mimeType?: string }|undefined} attachment @param {string} [storagePath] */
export function resolveAttachmentContentType(attachment, storagePath = '') {
  const fromMeta = String(attachment?.mimeType || '').trim();
  if (fromMeta && fromMeta !== 'application/octet-stream') {
    return withUtf8Charset(fromMeta.split(';')[0].trim());
  }
  const name = String(attachment?.name || storagePath || '').trim();
  const guessed = guessMimeFromFileName(name);
  if (guessed) return withUtf8Charset(guessed);
  return 'application/octet-stream';
}

export function shouldOpenAttachmentInline(mimeType) {
  const mime = String(mimeType || '').split(';')[0].trim().toLowerCase();
  return mime.startsWith('text/') || mime.startsWith('image/') || mime === 'application/pdf';
}

export function resolveAttachmentDownloadName(attachment, storagePath = '') {
  const name = String(attachment?.name || '').trim();
  if (name) return name;
  const base = String(storagePath || '').split('/').pop() || 'download';
  const idx = base.indexOf('_');
  return idx >= 0 ? base.slice(idx + 1) || base : base;
}

/** @param {Blob} blob @param {string} fileName */
export function triggerBlobDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function ensureTypedBlob(data, mimeType) {
  let blob = data instanceof Blob ? data : new Blob([data]);
  const probeType = String(blob.type || '').toLowerCase();
  if (probeType.includes('json') || probeType.includes('html')) {
    const snippet = (await blob.slice(0, 280).text()).trimStart();
    if (snippet.startsWith('{') || snippet.startsWith('<')) {
      throw new Error('Không tải được tệp đính kèm.');
    }
  }
  const targetType = withUtf8Charset(mimeType);
  if (!blob.type || blob.type === 'application/octet-stream' || blob.type !== targetType) {
    blob = new Blob([await blob.arrayBuffer()], { type: targetType });
  }
  return blob;
}

export { ensureTypedBlob, withUtf8Charset };
