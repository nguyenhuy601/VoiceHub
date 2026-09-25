/**
 * Paths and intake docClass helpers for CustomerDocument uploads.
 */

const INTAKE_DOC_CLASSES = Object.freeze([
  'customer_raw',
  'customer_file',
  'reference_attachment',
]);

const CUSTOMER_DOC_MAX_BYTES = 20 * 1024 * 1024;

const ALLOWED_EXTENSIONS = Object.freeze([
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.md',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.zip',
]);

function sanitizeFilename(raw) {
  const base = String(raw || 'file')
    .replace(/\\/g, '/')
    .split('/')
    .pop();
  const cleaned = String(base || 'file')
    .replace(/[^\w.\- ()\[\]]+/g, '_')
    .replace(/\.{2,}/g, '.')
    .trim()
    .slice(0, 180);
  return cleaned || 'file';
}

/**
 * Build MinIO object key — never uses pending/ prefix.
 * Prefer project path; pack-only HITL uses packs/{packId}/...
 * @param {{ projectId?: string, packId?: string, docClass?: string, filename: string }} opts
 */
function buildCustomerDocumentStoragePath({ projectId, packId, docClass, filename }) {
  const pid = String(projectId || '').trim();
  const pack = String(packId || '').trim();
  const safeName = sanitizeFilename(filename);
  const cls = String(docClass || 'other')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 40) || 'other';
  const stamp = Date.now();
  if (pid) {
    return `projects/${pid}/customer-docs/${cls}/${stamp}-${safeName}`.slice(0, 512);
  }
  if (pack) {
    return `packs/${pack}/customer-docs/${cls}/${stamp}-${safeName}`.slice(0, 512);
  }
  throw new Error('projectId or packId required for storage path');
}

function normalizeIntakeDocClass(raw) {
  const c = String(raw || '').trim().toLowerCase();
  if (INTAKE_DOC_CLASSES.includes(c)) return c;
  return null;
}

module.exports = {
  INTAKE_DOC_CLASSES,
  CUSTOMER_DOC_MAX_BYTES,
  ALLOWED_EXTENSIONS,
  sanitizeFilename,
  buildCustomerDocumentStoragePath,
  normalizeIntakeDocClass,
};
