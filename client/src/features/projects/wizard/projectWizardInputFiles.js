/** Client-side validation helpers for wizard intake file uploads. */

export const ALLOWED_EXTENSIONS = Object.freeze([
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

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_FILES_PER_GROUP = 10;

export const INTAKE_DOC_CLASS = Object.freeze({
  requirement: 'customer_raw',
  customerFiles: 'customer_file',
  references: 'reference_attachment',
});

function fileExtension(name) {
  const n = String(name || '').toLowerCase();
  const i = n.lastIndexOf('.');
  return i >= 0 ? n.slice(i) : '';
}

/**
 * @returns {{ ok: true } | { ok: false, reason: 'ext'|'size'|'empty' }}
 */
export function validateIntakeFile(file) {
  if (!file) return { ok: false, reason: 'empty' };
  const size = Number(file.size);
  if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: 'empty' };
  if (size > MAX_FILE_BYTES) return { ok: false, reason: 'size' };
  const ext = fileExtension(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) return { ok: false, reason: 'ext' };
  return { ok: true };
}

/**
 * Build ordered upload queue: requirement → customerFiles → references.
 * @param {{ requirement: File|null, customerFiles: File[], references: File[] }} intakeFiles
 * @returns {{ file: File, docClass: string, group: string }[]}
 */
export function buildIntakeUploadQueue(intakeFiles = {}) {
  const queue = [];
  const req = intakeFiles.requirement;
  if (req) {
    queue.push({ file: req, docClass: INTAKE_DOC_CLASS.requirement, group: 'requirement' });
  }
  for (const f of Array.isArray(intakeFiles.customerFiles) ? intakeFiles.customerFiles : []) {
    if (f) queue.push({ file: f, docClass: INTAKE_DOC_CLASS.customerFiles, group: 'customerFiles' });
  }
  for (const f of Array.isArray(intakeFiles.references) ? intakeFiles.references : []) {
    if (f) queue.push({ file: f, docClass: INTAKE_DOC_CLASS.references, group: 'references' });
  }
  return queue;
}

export function emptyIntakeFiles() {
  return { requirement: null, customerFiles: [], references: [] };
}

export function countIntakeFiles(intakeFiles = {}) {
  const req = intakeFiles.requirement ? 1 : 0;
  const cf = Array.isArray(intakeFiles.customerFiles) ? intakeFiles.customerFiles.length : 0;
  const rf = Array.isArray(intakeFiles.references) ? intakeFiles.references.length : 0;
  return { requirement: req, customerFiles: cf, references: rf, total: req + cf + rf };
}
