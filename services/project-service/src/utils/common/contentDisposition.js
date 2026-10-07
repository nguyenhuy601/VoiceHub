/**
 * Build a safe Content-Disposition attachment header (ASCII fallback + RFC 5987).
 * @param {string} filename
 * @param {string} [fallback='download.bin']
 * @returns {string}
 */
function attachmentHeader(filename, fallback = 'download.bin') {
  const raw = String(filename || '').trim() || fallback;
  const cleaned = raw
    .replace(/[\r\n"/\\]/g, '')
    .replace(/\.\./g, '')
    .slice(0, 180);
  const ascii = cleaned
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || fallback;
  const encoded = encodeURIComponent(cleaned || fallback);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

module.exports = {
  attachmentHeader,
};
