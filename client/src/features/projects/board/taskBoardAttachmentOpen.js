import apiClient from '../../../services/api/apiClient';
import { resolveStoragePathFromAttachment } from './taskBoardAttachmentUtils';
import {
  ensureTypedBlob,
  resolveAttachmentContentType,
  resolveAttachmentDownloadName,
  shouldOpenAttachmentInline,
  triggerBlobDownload,
  withUtf8Charset,
} from './taskBoardAttachmentDisplay';

async function fetchStorageObjectBlob(storagePath) {
  const payload = await apiClient.get('/messages/storage/object', {
    params: { storagePath },
    responseType: 'blob',
    skipGlobalErrorHandling: true,
  });
  if (payload instanceof Blob) {
    // Axios blob + JSON lỗi → parse messageUser
    const type = String(payload.type || '').toLowerCase();
    if (type.includes('json') || payload.size < 800) {
      const text = (await payload.slice(0, 800).text()).trim();
      if (text.startsWith('{') || text === 'null') {
        let msg = 'Không tải được tệp đính kèm.';
        try {
          const j = JSON.parse(text);
          msg = j.messageUser || j.message || msg;
        } catch {
          if (text === 'null') msg = 'Không tải được tệp đính kèm.';
        }
        const err = new Error(msg);
        err.userMessage = msg;
        throw err;
      }
    }
    return payload;
  }
  if (payload?.data instanceof Blob) return payload.data;
  throw new Error('Không tải được tệp đính kèm.');
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function writeHtmlToTab(tab, fileName, bodyText) {
  if (!tab || tab.closed) return false;
  try {
    const html = `<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(fileName)}</title><style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:1rem;line-height:1.5;white-space:pre-wrap;word-break:break-word;background:#0b0f14;color:#e8eaed}</style></head><body>${escapeHtml(bodyText)}</body></html>`;
    tab.document.open();
    tab.document.write(html);
    tab.document.close();
    try {
      tab.focus();
    } catch {
      /* ignore */
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mở file đính kèm đã upload (storagePath) qua API same-origin.
 * Fetch trước — chỉ mở tab khi đã có nội dung (tránh about:blank + 500).
 */
export async function openTaskBoardAttachment(attachment) {
  const storagePath = resolveStoragePathFromAttachment(attachment);
  if (!storagePath) {
    const externalUrl = String(attachment?.url || '').trim();
    if (/^https?:\/\//i.test(externalUrl)) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    throw new Error('Không tải được tệp đính kèm.');
  }

  const contentType = resolveAttachmentContentType(attachment, storagePath);
  const fileName = resolveAttachmentDownloadName(attachment, storagePath);
  const baseMime = contentType.split(';')[0].trim().toLowerCase();
  const openInline = shouldOpenAttachmentInline(contentType);
  const isPlainText = baseMime.startsWith('text/') && baseMime !== 'text/html';

  const payload = await fetchStorageObjectBlob(storagePath);
  let fileBlob = await ensureTypedBlob(payload, withUtf8Charset(contentType));

  if (openInline && isPlainText) {
    const text = await fileBlob.text();
    const tab = window.open('about:blank', '_blank');
    if (tab && writeHtmlToTab(tab, fileName, text)) return;
    triggerBlobDownload(fileBlob, fileName);
    return;
  }

  if (openInline) {
    const blobUrl = URL.createObjectURL(fileBlob);
    const opened = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!opened) triggerBlobDownload(fileBlob, fileName);
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    return;
  }

  triggerBlobDownload(fileBlob, fileName);
}

export {
  isStorageObjectPath,
  resolveStoragePathFromAttachment,
  isStoredObjectAttachment,
} from './taskBoardAttachmentUtils';

export {
  resolveAttachmentContentType,
  shouldOpenAttachmentInline,
  resolveAttachmentDownloadName,
} from './taskBoardAttachmentDisplay';
