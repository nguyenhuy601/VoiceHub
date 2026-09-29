/**
 * Companion sheets from Customer Raw: NFR, business request, reference,
 * and extra FR columns (not on requirementNodeSchema).
 * Pure / deterministic. Does not create functionalRequirements.
 */

const XLSX = require('xlsx');
const {
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
} = require('../../constants/customerRawTemplate.constants');
const { normHeader, normId, normKey, normProse } = require('./requirementTemplateTextNorm');

const NFR_SHEET_ALIASES = Object.freeze([
  CUSTOMER_RAW_SHEETS.NFR,
  '04_NFR',
  'NFR',
  'Non Functional Requirements',
  'Non-Functional Requirements',
]);

const BUSINESS_REQUEST_ALIASES = Object.freeze([
  CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
  '02_Business_Request',
  'Business Request',
  'Business Requests',
]);

const REFERENCE_ALIASES = Object.freeze([
  CUSTOMER_RAW_SHEETS.REFERENCE,
  '05_Reference',
  'Reference',
  'References',
]);

const REQUIREMENT_SHEET_ALIASES = Object.freeze([
  CUSTOMER_RAW_SHEETS.REQUIREMENT,
  '03_Requirement',
  'Functional Requirements',
  'Functional Requirement',
  'FR',
  'Requirements',
]);

/** Normalized headers that map onto the FR node — not stored in requirementSources.fields. */
const FR_MAPPED_HEADERS = Object.freeze(
  new Set(
    [
      'requirement id',
      'req id',
      'fr id',
      'id',
      'requirement no',
      'requirement',
      'feature',
      'functional requirement',
      'requirement statement',
      'description',
      'details',
      'detail',
      'module / area',
      'module/area',
      'module',
      'area',
      'acceptance criteria',
      'acceptance / expected result',
      'acceptance',
      'expected result',
      'ac',
      'user / actor',
      'user/actor',
      'actor',
      'user',
      'priority',
    ].map((h) => normHeader(h))
  )
);

const NFR_ID_HEADERS = Object.freeze(['nfr id', 'id']);
const NFR_CATEGORY_HEADERS = Object.freeze(['category']);
const NFR_REQUIREMENT_HEADERS = Object.freeze([
  'customer requirement',
  'requirement',
  'nfr',
]);
const NFR_TARGET_HEADERS = Object.freeze(['target']);
const NFR_PRIORITY_HEADERS = Object.freeze(['priority']);
const NFR_SOURCE_HEADERS = Object.freeze(['source']);

const BR_ID_HEADERS = Object.freeze(['request id', 'id']);
const REF_ID_HEADERS = Object.freeze(['reference id', 'id']);
const REQ_ID_HEADERS = Object.freeze([
  'requirement id',
  'req id',
  'fr id',
  'id',
  'requirement no',
]);

function emptyCustomerRawRows() {
  return {
    businessRequests: [],
    references: [],
    requirementSources: [],
  };
}

function sheetNameKey(name) {
  return normHeader(name).replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}

function findSheetName(workbook, aliases) {
  const names = workbook?.SheetNames || [];
  const aliasKeys = new Set(aliases.map((a) => sheetNameKey(a)));
  for (const name of names) {
    if (aliasKeys.has(sheetNameKey(name))) return name;
  }
  return null;
}

function sheetToMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

function headerIndexes(headerRow) {
  const indexes = [];
  (headerRow || []).forEach((cell, index) => {
    const original = String(cell ?? '').trim();
    if (!original) return;
    indexes.push({
      index,
      original,
      normalized: normHeader(original),
    });
  });
  return indexes;
}

function firstIndex(indexes, aliases) {
  const set = new Set(aliases.map((a) => normHeader(a)));
  const hit = indexes.find((col) => set.has(col.normalized));
  return hit ? hit.index : -1;
}

function cellAt(line, index) {
  if (index == null || index < 0) return '';
  return line?.[index];
}

/**
 * Rows with an id column → { externalId, sheet, row, fields }.
 * fields keep original header strings for every non-empty column.
 */
function extractIdRows(matrix, sheetName, idAliases) {
  if (!matrix?.length) {
    return { rows: [], missingId: 0 };
  }
  const indexes = headerIndexes(matrix[0]);
  const idIndex = firstIndex(indexes, idAliases);
  if (idIndex < 0) {
    return { rows: [], missingId: 0 };
  }

  const rows = [];
  let missingId = 0;
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAny = line.some((c) => normProse(c));
    if (!hasAny) continue;
    const externalId = normId(cellAt(line, idIndex)).slice(0, 64);
    if (!externalId) {
      missingId += 1;
      continue;
    }
    const fields = {};
    for (const col of indexes) {
      const value = normProse(cellAt(line, col.index));
      if (!value) continue;
      fields[col.original] = value.slice(0, 4000);
    }
    rows.push({
      externalId,
      sheet: sheetName,
      row: r + 1,
      fields,
    });
  }
  return { rows, missingId };
}

function extractNfr(workbook) {
  const sheetName = findSheetName(workbook, NFR_SHEET_ALIASES);
  if (!sheetName) {
    return { nonFunctionalRequirements: [], missingId: 0 };
  }
  const matrix = sheetToMatrix(workbook, sheetName);
  if (!matrix?.length) {
    return { nonFunctionalRequirements: [], missingId: 0 };
  }
  const indexes = headerIndexes(matrix[0]);
  const idIndex = firstIndex(indexes, NFR_ID_HEADERS);
  if (idIndex < 0) {
    return { nonFunctionalRequirements: [], missingId: 0 };
  }
  const categoryIndex = firstIndex(indexes, NFR_CATEGORY_HEADERS);
  const requirementIndex = firstIndex(indexes, NFR_REQUIREMENT_HEADERS);
  const targetIndex = firstIndex(indexes, NFR_TARGET_HEADERS);
  const priorityIndex = firstIndex(indexes, NFR_PRIORITY_HEADERS);
  const sourceIndex = firstIndex(indexes, NFR_SOURCE_HEADERS);

  const nonFunctionalRequirements = [];
  let missingId = 0;
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAny = line.some((c) => normProse(c));
    if (!hasAny) continue;
    const externalId = normId(cellAt(line, idIndex)).slice(0, 64);
    if (!externalId) {
      missingId += 1;
      continue;
    }
    const requirement = normProse(cellAt(line, requirementIndex)).slice(0, 2000);
    if (!requirement) continue;
    nonFunctionalRequirements.push({
      externalId,
      category: normProse(cellAt(line, categoryIndex)).slice(0, 64),
      requirement,
      target: normProse(cellAt(line, targetIndex)).slice(0, 500),
      priority: normKey(cellAt(line, priorityIndex), { kind: 'priority' }) || 'Medium',
      source: normProse(cellAt(line, sourceIndex)).slice(0, 500),
    });
  }
  return { nonFunctionalRequirements, missingId };
}

/**
 * Extra FR columns that are not on requirementNodeSchema.
 * RULE-FIELDS-01: header keys stay as written on the sheet.
 */
function extractRequirementSources(workbook) {
  const sheetName = findSheetName(workbook, REQUIREMENT_SHEET_ALIASES);
  if (!sheetName) {
    return { requirementSources: [], missingId: 0 };
  }
  const matrix = sheetToMatrix(workbook, sheetName);
  if (!matrix?.length) {
    return { requirementSources: [], missingId: 0 };
  }
  const indexes = headerIndexes(matrix[0]);
  const idIndex = firstIndex(indexes, REQ_ID_HEADERS);
  if (idIndex < 0) {
    return { requirementSources: [], missingId: 0 };
  }
  const extraCols = indexes.filter((col) => !FR_MAPPED_HEADERS.has(col.normalized));
  if (!extraCols.length) {
    return { requirementSources: [], missingId: 0 };
  }

  const requirementSources = [];
  let missingId = 0;
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const hasAny = line.some((c) => normProse(c));
    if (!hasAny) continue;
    const externalId = normId(cellAt(line, idIndex)).slice(0, 64);
    if (!externalId) {
      missingId += 1;
      continue;
    }
    const fields = {};
    for (const col of extraCols) {
      const value = normProse(cellAt(line, col.index));
      if (!value) continue;
      fields[col.original] = value.slice(0, 4000);
    }
    if (!Object.keys(fields).length) continue;
    requirementSources.push({
      externalId,
      sheet: sheetName,
      row: r + 1,
      fields,
    });
  }
  return { requirementSources, missingId };
}

/**
 * @param {object} workbook — SheetJS workbook
 * @returns {{
 *   nonFunctionalRequirements: object[],
 *   customerRawRows: { businessRequests, references, requirementSources },
 *   meta: { missingIdNfr: number, missingIdBusinessRequest: number, missingIdReference: number }
 * }}
 */
function extractCompanionFromWorkbook(workbook) {
  const nfr = extractNfr(workbook);
  const brSheet = findSheetName(workbook, BUSINESS_REQUEST_ALIASES);
  const refSheet = findSheetName(workbook, REFERENCE_ALIASES);
  const br = brSheet
    ? extractIdRows(sheetToMatrix(workbook, brSheet), brSheet, BR_ID_HEADERS)
    : { rows: [], missingId: 0 };
  const ref = refSheet
    ? extractIdRows(sheetToMatrix(workbook, refSheet), refSheet, REF_ID_HEADERS)
    : { rows: [], missingId: 0 };
  const reqSrc = extractRequirementSources(workbook);

  return {
    nonFunctionalRequirements: nfr.nonFunctionalRequirements,
    customerRawRows: {
      businessRequests: br.rows,
      references: ref.rows,
      requirementSources: reqSrc.requirementSources,
    },
    meta: {
      missingIdNfr: nfr.missingId,
      missingIdBusinessRequest: br.missingId,
      missingIdReference: ref.missingId,
      expectedNfrColumns: CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.NFR],
    },
  };
}

/**
 * @param {Buffer} buffer
 * @param {{ filename?: string, documentId?: string }} [opts]
 */
function extractWorkbookCompanion(buffer, opts = {}) {
  void opts;
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return {
      nonFunctionalRequirements: [],
      customerRawRows: emptyCustomerRawRows(),
      meta: {
        missingIdNfr: 0,
        missingIdBusinessRequest: 0,
        missingIdReference: 0,
      },
    };
  }
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    return extractCompanionFromWorkbook(workbook);
  } catch {
    return {
      nonFunctionalRequirements: [],
      customerRawRows: emptyCustomerRawRows(),
      meta: {
        missingIdNfr: 0,
        missingIdBusinessRequest: 0,
        missingIdReference: 0,
        parseError: true,
      },
    };
  }
}

module.exports = {
  emptyCustomerRawRows,
  extractWorkbookCompanion,
  extractCompanionFromWorkbook,
  NFR_SHEET_ALIASES,
  BUSINESS_REQUEST_ALIASES,
  REFERENCE_ALIASES,
  FR_MAPPED_HEADERS,
};
