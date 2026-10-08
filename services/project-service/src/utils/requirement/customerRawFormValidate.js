/**
 * Customer Raw workbook — form validation only (sheets + headers).
 * RULE-FORM-01 / RULE-NO-CONTENT-QUOTA-01: sheets+headers only (no content volume).
 * FR presence for G4 is enforced separately (assertRequiredIntakeSections / lazy prepare).
 */

const XLSX = require('xlsx');
const {
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
} = require('../../constants/customerRawTemplate.constants');
const {
  isCustomerRawTemplateType,
  looksLikeCustomerRawWorkbook,
  readMeta,
} = require('./customerRawContextParse');
const { normHeader } = require('./requirementTemplateTextNorm');

function loadWorkbook(bufferOrWb) {
  if (bufferOrWb && typeof bufferOrWb === 'object' && Array.isArray(bufferOrWb.SheetNames)) {
    return bufferOrWb;
  }
  const buffer = Buffer.isBuffer(bufferOrWb)
    ? bufferOrWb
    : Buffer.from(bufferOrWb || []);
  if (!buffer.length) return null;
  return XLSX.read(buffer, { type: 'buffer', cellDates: true });
}

function headerRowOfSheet(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return [];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
  const row = (matrix || []).find((r) =>
    Array.isArray(r) && r.some((c) => String(c || '').trim() !== '')
  );
  return (row || []).map((c) => String(c || '').trim()).filter(Boolean);
}

function headerSetNormalized(headers) {
  return new Set(headers.map((h) => normHeader(h)).filter(Boolean));
}

/**
 * @param {Buffer|object} bufferOrWorkbook
 * @returns {{
 *   ok: boolean,
 *   templateType: string,
 *   templateVersion: string,
 *   recognizedAsCustomerRaw: boolean,
 *   missingSheets: string[],
 *   missingHeadersBySheet: Record<string, string[]>,
 *   presentSheets: string[],
 * }}
 */
function validateCustomerRawForm(bufferOrWorkbook) {
  const workbook = loadWorkbook(bufferOrWorkbook);
  if (!workbook) {
    return {
      ok: false,
      templateType: '',
      templateVersion: '',
      recognizedAsCustomerRaw: false,
      missingSheets: Object.values(CUSTOMER_RAW_SHEETS),
      missingHeadersBySheet: {},
      presentSheets: [],
      errorCode: 'EMPTY_BUFFER',
    };
  }

  const meta = readMeta(workbook);
  const recognizedAsCustomerRaw =
    isCustomerRawTemplateType(meta.templateType) || looksLikeCustomerRawWorkbook(workbook);

  const expectedSheets = Object.values(CUSTOMER_RAW_SHEETS);
  const nameSet = new Set((workbook.SheetNames || []).map((n) => String(n || '')));
  const presentSheets = expectedSheets.filter((s) => nameSet.has(s));
  const missingSheets = expectedSheets.filter((s) => !nameSet.has(s));

  const missingHeadersBySheet = {};
  for (const sheetName of expectedSheets) {
    if (!nameSet.has(sheetName)) continue;
    const expected = CUSTOMER_RAW_SHEET_COLUMNS[sheetName] || [];
    const headers = headerRowOfSheet(workbook, sheetName);
    const have = headerSetNormalized(headers);
    const missing = expected.filter((col) => !have.has(normHeader(col)));
    if (missing.length) missingHeadersBySheet[sheetName] = missing;
  }

  const ok =
    recognizedAsCustomerRaw &&
    missingSheets.length === 0 &&
    Object.keys(missingHeadersBySheet).length === 0;

  return {
    ok,
    templateType: meta.templateType || (recognizedAsCustomerRaw ? CUSTOMER_RAW_TEMPLATE_TYPE : ''),
    templateVersion: meta.templateVersion || '',
    recognizedAsCustomerRaw,
    missingSheets,
    missingHeadersBySheet,
    presentSheets,
    errorCode: ok ? null : 'CUSTOMER_RAW_FORM_INVALID',
  };
}

module.exports = {
  validateCustomerRawForm,
  loadWorkbook,
};
