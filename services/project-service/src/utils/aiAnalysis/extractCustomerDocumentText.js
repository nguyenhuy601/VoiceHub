/**
 * Extract plain text from CustomerDocument buffers (no new npm deps).
 * Pure for txt/xlsx; PDF/images are skipped (no OCR).
 */

const path = require('path');
const XLSX = require('xlsx');

const PER_FILE_MAX_CHARS = 8_000;

function extOf(filename = '', mimeType = '') {
  const fromName = path.extname(String(filename || '')).toLowerCase();
  if (fromName) return fromName;
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '.xlsx';
  if (mime.includes('text/plain')) return '.txt';
  if (mime.includes('markdown')) return '.md';
  if (mime.includes('csv')) return '.csv';
  if (mime.includes('pdf')) return '.pdf';
  if (mime.includes('png')) return '.png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  return '';
}

function truncate(text, max = PER_FILE_MAX_CHARS) {
  const s = String(text || '').replace(/\u0000/g, '').trim();
  if (!s) return '';
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function extractPlainText(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  return truncate(buffer.toString('utf8'));
}

function extractWorkbookText(buffer) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return '';
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const parts = [];
    for (const name of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      const lines = [];
      for (const row of rows) {
        if (!Array.isArray(row)) continue;
        const line = row
          .map((c) => String(c ?? '').trim())
          .filter(Boolean)
          .join(' | ');
        if (line) lines.push(line);
      }
      if (lines.length) {
        parts.push(`[Sheet: ${name}]\n${lines.join('\n')}`);
      }
    }
    return truncate(parts.join('\n\n'));
  } catch {
    return '';
  }
}

function isIntakeCorpusEnabled() {
  const raw = String(process.env.WHAT_INTAKE_CORPUS || '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimeType?: string }} opts
 * @returns {Promise<{ text: string, skipped?: string, method?: string }>}
 */
async function extractCustomerDocumentText(buffer, opts = {}) {
  if (!isIntakeCorpusEnabled()) {
    return { text: '', skipped: 'WHAT_INTAKE_CORPUS_off' };
  }
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { text: '', skipped: 'empty_buffer' };
  }

  const ext = extOf(opts.filename, opts.mimeType);
  if (['.txt', '.md', '.csv', '.log'].includes(ext)) {
    return { text: extractPlainText(buffer), method: 'utf8' };
  }
  if (['.xlsx', '.xls'].includes(ext)) {
    const text = extractWorkbookText(buffer);
    return text
      ? { text, method: 'xlsx' }
      : { text: '', skipped: 'xlsx_empty' };
  }
  if (['.pdf', '.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
    return { text: '', skipped: `unsupported_binary:${ext}` };
  }
  return { text: '', skipped: `unsupported_ext:${ext || 'unknown'}` };
}

module.exports = {
  PER_FILE_MAX_CHARS,
  isIntakeCorpusEnabled,
  extOf,
  extractPlainText,
  extractWorkbookText,
  extractCustomerDocumentText,
};
