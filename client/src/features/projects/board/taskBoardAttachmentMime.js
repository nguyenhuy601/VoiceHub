/** MIME cho phép upload task attachment (server từ chối application/octet-stream). */

export function guessMimeFromFileName(name) {
  const n = String(name || '').toLowerCase();
  if (n.endsWith('.pdf')) return 'application/pdf';
  if (n.endsWith('.png')) return 'image/png';
  if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
  if (n.endsWith('.gif')) return 'image/gif';
  if (n.endsWith('.webp')) return 'image/webp';
  if (n.endsWith('.svg')) return 'image/svg+xml';
  if (n.endsWith('.txt')) return 'text/plain';
  if (n.endsWith('.md') || n.endsWith('.markdown')) return 'text/plain';
  if (n.endsWith('.csv')) return 'text/csv';
  if (n.endsWith('.json')) return 'application/json';
  if (n.endsWith('.zip')) return 'application/zip';
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
  return '';
}

export function resolveTaskAttachmentMime(file) {
  const fromType = String(file?.type || '').trim();
  if (fromType && fromType !== 'application/octet-stream') return fromType;
  const fromName = guessMimeFromFileName(file?.name);
  if (fromName) return fromName;
  return '';
}
