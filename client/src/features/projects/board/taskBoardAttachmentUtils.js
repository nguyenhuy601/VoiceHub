/** @param {string|undefined|null} value */
export function isStorageObjectPath(value) {
  const s = String(value || '').trim();
  if (!s || /^https?:\/\//i.test(s)) return false;
  return /^(temp|tasks|chat|dm)\//.test(s.replace(/^\/+/, ''));
}

/** @param {{ url?: string, storagePath?: string }|null|undefined} attachment */
export function resolveStoragePathFromAttachment(attachment) {
  if (!attachment) return '';
  const sp = String(attachment.storagePath || '').trim();
  if (sp && isStorageObjectPath(sp)) return sp;
  const url = String(attachment.url || '').trim();
  if (isStorageObjectPath(url)) return url;
  return '';
}

/** @param {{ url?: string, storagePath?: string }|null|undefined} attachment */
export function isStoredObjectAttachment(attachment) {
  return Boolean(resolveStoragePathFromAttachment(attachment));
}
