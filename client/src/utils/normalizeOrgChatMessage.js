function hasFileMetaSignal(fm) {
  if (!fm || typeof fm !== 'object') return false;
  return Boolean(
    fm.storagePath ||
      fm.originalName ||
      fm.mimeType ||
      (fm.byteSize != null && Number.isFinite(Number(fm.byteSize)))
  );
}

/**
 * Chuẩn hóa payload tin nhắn org (kênh chat / voice) để UI nhận diện file/ảnh đúng.
 * Sau F5, GET /messages (summary) có thể thiếu signed URL nhưng vẫn có fileMeta / messageType.
 */
export function normalizeOrgChatMessage(msg) {
  if (!msg || typeof msg !== 'object') return msg;
  const fm = msg.fileMeta;
  const content = String(msg.content ?? '');
  const isHttp = /^https?:\/\//i.test(content);
  const isStorage =
    isHttp &&
    /storage\.googleapis\.com|firebasestorage\.app|googleapis\.com\/storage/i.test(content);
  const mtRaw = String(msg.messageType || 'text').toLowerCase();

  if (mtRaw === 'business_card' || mtRaw === 'call_log' || mtRaw === 'system') return msg;

  if (mtRaw === 'file' || mtRaw === 'image') {
    const mime = String(fm?.mimeType || '').toLowerCase();
    const asImage = mtRaw === 'image' || mime.startsWith('image/');
    return { ...msg, messageType: asImage ? 'image' : 'file' };
  }

  if (hasFileMetaSignal(fm) || (isStorage && fm) || (isStorage && !msg.messageType)) {
    const mime = String(fm?.mimeType || '').toLowerCase();
    const asImage = mime.startsWith('image/');
    return {
      ...msg,
      messageType: asImage ? 'image' : 'file',
    };
  }

  if (isStorage && (mtRaw === 'text' || !msg.messageType)) {
    return { ...msg, messageType: 'file' };
  }

  return msg;
}

export function normalizeOrgChatMessages(list) {
  if (!Array.isArray(list)) return [];
  return list.map(normalizeOrgChatMessage);
}
