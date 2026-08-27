import apiClient from '../../../services/api/apiClient';
import { resolveStoragePathFromAttachment } from './taskBoardAttachmentUtils';
import {
  ensureTypedBlob,
  resolveAttachmentContentType,
  resolveAttachmentDownloadName,
  shouldOpenAttachmentInline,
  triggerBlobDownload,
} from './taskBoardAttachmentDisplay';

/**
 * Mở file đính kèm đã upload (storagePath) qua API same-origin + blob URL.
 * Link https://... mở tab mới trực tiếp.
 */
export async function openTaskBoardAttachment(attachment) {
  const storagePath = resolveStoragePathFromAttachment(attachment);
  if (!storagePath) {
    const externalUrl = String(attachment?.url || '').trim();
    if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    }
    return;
  }

  const contentType = resolveAttachmentContentType(attachment, storagePath);
  const fileName = resolveAttachmentDownloadName(attachment, storagePath);

  const payload = await apiClient.get('/messages/storage/object', {
    params: { storagePath },
    responseType: 'blob',
  });

  const fileBlob = await ensureTypedBlob(payload, contentType);

  if (shouldOpenAttachmentInline(contentType)) {
    const blobUrl = URL.createObjectURL(fileBlob);
    window.open(blobUrl, '_blank', 'noopener,noreferrer');
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
