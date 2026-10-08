/** UTF-8 BOM — Excel mở CSV tiếng Việt đúng encoding. */
export const CSV_BOM = '\uFEFF';

/**
 * Escape một ô CSV: chống formula injection (=+@-\\t\\r) + RFC4180 quote.
 * @param {unknown} value
 * @returns {string}
 */
export function escapeCsvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/**
 * @param {unknown[][]} rows
 * @returns {string}
 */
export function buildCsv(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const body = list.map((row) => (Array.isArray(row) ? row : []).map(escapeCsvCell).join(',')).join('\n');
  return `${CSV_BOM}${body}`;
}
