/** Helpers dùng chung cho org / project chat message actions. */

function isHttpUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

/** URL đọc file từ Firebase/GCS — không phải caption người dùng. */
export function isAttachmentStorageUrl(value) {
  const s = String(value || '').trim();
  if (!isHttpUrl(s)) return false;
  return (
    /storage\.googleapis\.com/i.test(s) ||
    /firebasestorage\.app/i.test(s) ||
    /googleapis\.com\/storage/i.test(s) ||
    /X-Goog-/i.test(s)
  );
}

/** Chú thích người dùng dưới file đính kèm (ẩn tên file mặc định + signed URL). */
export function resolveAttachmentUserCaption(message) {
  const content = String(message?.content ?? '').trim();
  if (!content || isAttachmentStorageUrl(content)) return '';
  const originalName = String(message?.fileMeta?.originalName || '').trim();
  if (originalName && content === originalName) return '';
  return content;
}

export function resolveAttachmentReadUrl(message) {
  const signed = String(message?.signedReadUrl || '').trim();
  if (isHttpUrl(signed)) return signed;
  const content = String(message?.content || '').trim();
  if (isAttachmentStorageUrl(content) || isHttpUrl(content)) return content;
  return '';
}

export function plainTextForMessage(msg, attachmentLabel = 'Attachment') {
  if (!msg) return '';
  const mt = msg.messageType || 'text';
  if (mt === 'text') return String(msg.content || '');
  if (mt === 'file' || mt === 'image') {
    const caption = resolveAttachmentUserCaption(msg);
    if (caption) return caption;
    return msg.fileMeta?.originalName || attachmentLabel;
  }
  return String(msg.content || '');
}

export function canShowCopyTextInMenu(msg) {
  if (!msg) return false;
  const mt = String(msg.messageType || 'text').toLowerCase();
  if (mt === 'image' || mt === 'file') return false;
  if (msg.fileMeta) return false;
  const raw = msg.content;
  if (raw == null) return false;
  const s = typeof raw === 'string' ? raw : String(raw);
  return s.trim().length > 0;
}

export function canEditOrgMessage(msg) {
  const mt = msg?.messageType || 'text';
  if (mt !== 'text') return false;
  if (msg?.fileMeta) return false;
  if (msg?.isDeleted || msg?.isRecalled) return false;
  return true;
}

export function senderIdFromMessage(msg) {
  return String(msg?.senderId?._id || msg?.senderId?.id || msg?.senderId || '').trim();
}
