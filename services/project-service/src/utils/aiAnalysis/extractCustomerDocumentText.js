/**
 * Extract plain text from CustomerDocument buffers (no new npm deps).
 * Pure for txt/xlsx; OCR optional via PADDLEOCR_URL.
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

function resolvePaddleOcrBaseUrl() {
  return String(process.env.PADDLEOCR_URL || process.env.PADDLE_OCR_URL || '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Optional OCR for PDF/images — best-effort; never throws.
 * @returns {Promise<{ text: string, skipped?: string }>}
 */
async function extractViaPaddleOcr(buffer, { filename, mimeType } = {}) {
  const base = resolvePaddleOcrBaseUrl();
  if (!base) {
    return { text: '', skipped: 'ocr_not_configured' };
  }
  try {
    const axios = require('axios');
    const b64 = buffer.toString('base64');
    const res = await axios.post(
      `${base}/ocr/predict`,
      {
        image: b64,
        filename: filename || 'doc.bin',
        mimeType: mimeType || 'application/octet-stream',
      },
      { timeout: 15_000, validateStatus: () => true, maxBodyLength: 25 * 1024 * 1024 }
    );
    if (res.status >= 400) {
      return { text: '', skipped: `ocr_http_${res.status}` };
    }
    const data = res.data;
    const text =
      data?.text ||
      data?.data?.text ||
      data?.result?.text ||
      (Array.isArray(data?.results) ? data.results.map((r) => r.text).join('\n') : '');
    return { text: truncate(text), skipped: text ? undefined : 'ocr_empty' };
  } catch (err) {
    return { text: '', skipped: `ocr_error:${String(err.message || 'fail').slice(0, 80)}` };
  }
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, mimeType?: string, ocrFn?: Function }} opts
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
    if (typeof opts.ocrFn === 'function') {
      return opts.ocrFn(buffer, opts);
    }
    return extractViaPaddleOcr(buffer, opts);
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
  extractViaPaddleOcr,
};
