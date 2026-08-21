const XLSX = require('xlsx');
const { sheetToMatrix } = require('./requirementTemplateParse');

const MAX_PREVIEW_ROWS = 500;
const MAX_PREVIEW_COLS = 30;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function cellToString(value) {
  if (value == null) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

function matrixToPreviewRows(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    return { rows: [], colCount: 0, truncated: false };
  }

  const truncatedRows = matrix.length > MAX_PREVIEW_ROWS;
  const slice = truncatedRows ? matrix.slice(0, MAX_PREVIEW_ROWS) : matrix;
  let maxCols = 0;
  for (const line of slice) {
    if (Array.isArray(line) && line.length > maxCols) maxCols = line.length;
  }
  const truncatedCols = maxCols > MAX_PREVIEW_COLS;
  const colCount = Math.min(maxCols, MAX_PREVIEW_COLS);

  const rows = slice.map((line, idx) => {
    const cells = [];
    for (let c = 0; c < colCount; c += 1) {
      cells.push(cellToString(Array.isArray(line) ? line[c] : ''));
    }
    return { rowNumber: idx + 1, cells };
  });

  return {
    rows,
    colCount,
    truncated: truncatedRows || truncatedCols,
  };
}

/**
 * Build a read-only spreadsheet snapshot for Excel Preview UI.
 * @param {Buffer} fileBuffer
 * @param {{ fileName?: string }} [options]
 */
function buildExcelPreviewFromBuffer(fileBuffer, options = {}) {
  const fileName = String(options.fileName || '').slice(0, 255);
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    return {
      fileName,
      sheetCount: 0,
      totalRows: 0,
      sheets: [],
    };
  }

  const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });
  const sheetNames = workbook.SheetNames || [];
  const sheets = [];
  let totalRows = 0;

  for (const name of sheetNames) {
    const matrix = sheetToMatrix(workbook, name) || [];
    const { rows, colCount, truncated } = matrixToPreviewRows(matrix);
    totalRows += rows.length;
    sheets.push({
      name: String(name || '').slice(0, 64),
      rowCount: rows.length,
      colCount,
      truncated,
      rows,
    });
  }

  return {
    fileName,
    sheetCount: sheets.length,
    totalRows,
    sheets,
  };
}

function buildRequirementSourceStoragePath(organizationId, packId) {
  const org = String(organizationId || '').trim();
  const pack = String(packId || '').trim();
  return `requirement-imports/${org}/${pack}.xlsx`.slice(0, 128);
}

module.exports = {
  MAX_PREVIEW_ROWS,
  MAX_PREVIEW_COLS,
  XLSX_MIME,
  buildExcelPreviewFromBuffer,
  buildRequirementSourceStoragePath,
  matrixToPreviewRows,
};
