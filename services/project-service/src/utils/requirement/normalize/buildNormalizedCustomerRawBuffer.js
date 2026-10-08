/**
 * Build Customer_Requirement_Raw.xlsx buffer from a normalize payload.
 * Always emits full sheet+header contract; empty data sheets keep header only.
 */

const ExcelJS = require('exceljs');
const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_META_DEFAULTS,
  CUSTOMER_RAW_README_ROWS,
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_TEMPLATE_VERSION,
  CUSTOMER_RAW_FILE_NAME,
} = require('../../../constants/customerRawTemplate.constants');

function addSheet(wb, name, columns, rows = []) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns);
  for (const row of rows) ws.addRow(row);
  ws.getRow(1).font = { bold: true };
  return ws;
}

/**
 * @param {{
 *   metaOverrides?: Record<string, string>,
 *   contextValues?: Record<string, string>,
 *   businessRequests?: any[][],
 *   requirements?: any[][],
 *   nfrs?: any[][],
 *   references?: any[][],
 * }} payload
 * @returns {Promise<Buffer>}
 */
async function buildNormalizedCustomerRawBuffer(payload = {}) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  const metaRows = CUSTOMER_RAW_META_DEFAULTS.map(([k, v]) => {
    const overrides = payload.metaOverrides || {};
    if (k === 'TemplateType') return [k, CUSTOMER_RAW_TEMPLATE_TYPE];
    if (k === 'TemplateVersion') return [k, CUSTOMER_RAW_TEMPLATE_VERSION];
    if (overrides[k] !== undefined && overrides[k] !== null) {
      return [k, String(overrides[k])];
    }
    return [k, v];
  });

  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.META,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.META],
    metaRows
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.README,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.README],
    [...CUSTOMER_RAW_README_ROWS]
  );

  const contextValues = payload.contextValues || {};
  const contextRows = CUSTOMER_RAW_CONTEXT_FIELDS.map((f) => [
    f.field,
    contextValues[f.field] != null ? String(contextValues[f.field]) : '',
    f.guidance,
  ]);
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.CONTEXT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.CONTEXT],
    contextRows
  );

  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST],
    payload.businessRequests || []
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REQUIREMENT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REQUIREMENT],
    payload.requirements || []
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.NFR,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.NFR],
    payload.nfrs || []
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.REFERENCE,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.REFERENCE],
    payload.references || []
  );

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function downloadFileName(profile) {
  const p = String(profile || '').trim();
  if (p && p !== 'unknown') {
    return `Customer_Requirement_Raw_${p}.xlsx`;
  }
  return CUSTOMER_RAW_FILE_NAME;
}

module.exports = {
  buildNormalizedCustomerRawBuffer,
  downloadFileName,
  CUSTOMER_RAW_FILE_NAME,
};
