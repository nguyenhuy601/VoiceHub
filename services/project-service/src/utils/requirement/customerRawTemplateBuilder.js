/**
 * Build Customer_Requirement_Raw.xlsx buffer (ExcelJS).
 */

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  CUSTOMER_RAW_FILE_NAME,
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_CONTEXT_EXAMPLE_VALUES,
  CUSTOMER_RAW_META_DEFAULTS,
  CUSTOMER_RAW_README_ROWS,
  CUSTOMER_RAW_EXAMPLE_ROWS,
} = require('../../constants/customerRawTemplate.constants');

const ASSET_PATH = path.join(__dirname, '../../../assets/Customer_Requirement_Raw.xlsx');

function addSheet(wb, name, columns, rows = []) {
  const ws = wb.addWorksheet(name);
  ws.addRow(columns);
  for (const row of rows) ws.addRow(row);
  return ws;
}

function buildContextRows() {
  return CUSTOMER_RAW_CONTEXT_FIELDS.map((f) => [
    f.field,
    CUSTOMER_RAW_CONTEXT_EXAMPLE_VALUES[f.field] || '',
    f.guidance,
  ]);
}

async function buildCustomerRawTemplateBuffer() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'VoiceHub';
  wb.created = new Date();

  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.META,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.META],
    CUSTOMER_RAW_META_DEFAULTS
  );
  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.README,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.README],
    CUSTOMER_RAW_README_ROWS
  );

  addSheet(
    wb,
    CUSTOMER_RAW_SHEETS.CONTEXT,
    CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.CONTEXT],
    buildContextRows()
  );

  for (const key of ['BUSINESS_REQUEST', 'REQUIREMENT', 'NFR', 'REFERENCE']) {
    const sheetName = CUSTOMER_RAW_SHEETS[key];
    addSheet(
      wb,
      sheetName,
      CUSTOMER_RAW_SHEET_COLUMNS[sheetName],
      CUSTOMER_RAW_EXAMPLE_ROWS[sheetName] || []
    );
  }

  return wb.xlsx.writeBuffer();
}

async function writeCustomerRawTemplateAsset() {
  const buf = await buildCustomerRawTemplateBuffer();
  await fs.promises.mkdir(path.dirname(ASSET_PATH), { recursive: true });
  await fs.promises.writeFile(ASSET_PATH, Buffer.from(buf));
  return ASSET_PATH;
}

async function loadCustomerRawTemplateBuffer() {
  try {
    return await fs.promises.readFile(ASSET_PATH);
  } catch {
    return buildCustomerRawTemplateBuffer();
  }
}

function getCustomerRawTemplateAssetPath() {
  return ASSET_PATH;
}

module.exports = {
  buildCustomerRawTemplateBuffer,
  loadCustomerRawTemplateBuffer,
  writeCustomerRawTemplateAsset,
  getCustomerRawTemplateAssetPath,
  CUSTOMER_RAW_FILE_NAME,
};
