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

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Tab trình duyệt không luôn tôn trọng charset trên blob:text — bọc HTML + meta utf-8.
 * @param {Blob} fileBlob
 * @param {string} fileName
 */
export async function blobForInlineTextView(fileBlob, fileName) {
  const text = await fileBlob.text();
  const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:1rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#0b0f14;color:#e8eaed}</style></head><body>${escapeHtml(text)}</body></html>`;
  return new Blob([html], { type: 'text/html;charset=utf-8' });
}

/**
 * @param {unknown} data
 * @param {string} mimeType
 * @returns {Promise<Blob>}
 */
async function ensureTypedBlob(data, mimeType) {
  if (data == null) {
    throw new Error('Không tải được tệp đính kèm.');
  }
  let blob = data instanceof Blob ? data : new Blob([/** @type {BlobPart} */ (data)]);
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error('Không tải được tệp đính kèm.');
  }

  const probeType = String(blob.type || '').toLowerCase();
  const snippet = (await blob.slice(0, 280).text()).trimStart();
  // API lỗi / axios trả JSON null → Blob chứa chữ "null"
  if (snippet === 'null' || snippet === 'undefined') {
    throw new Error('Không tải được tệp đính kèm.');
  }
  if (snippet.startsWith('{') && (probeType.includes('json') || /"success"\s*:/.test(snippet))) {
    throw new Error('Không tải được tệp đính kèm.');
  }
  if (snippet.startsWith('<') && probeType.includes('html')) {
    throw new Error('Không tải được tệp đính kèm.');
  }

  const targetType = withUtf8Charset(mimeType);
  if (!blob.type || blob.type === 'application/octet-stream' || blob.type !== targetType) {
    blob = new Blob([await blob.arrayBuffer()], { type: targetType });
  }
  return blob;
}

export { ensureTypedBlob, withUtf8Charset };
