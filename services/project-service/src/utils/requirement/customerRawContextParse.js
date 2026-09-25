/**
 * Parse Customer Requirement Raw workbook — Meta + 01_Project_Context only.
 * Pure helper for create-project wizard intake autofill.
 */

const XLSX = require('xlsx');
const {
  CUSTOMER_RAW_TEMPLATE_TYPE,
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_SHEET_COLUMNS,
} = require('../../constants/customerRawTemplate.constants');
const { normHeader, normProse } = require('./requirementTemplateTextNorm');

/** Normalized Field label → canonical context key. */
const CONTEXT_LABEL_ALIASES = Object.freeze({
  'project name': 'projectName',
  customer: 'customer',
  'customer name': 'customer',
  'project objective': 'projectObjective',
  'business description': 'businessDescription',
  'business problem': 'businessProblem',
  'business scope': 'businessScope',
  'target users': 'targetUsers',
  'expected users / scale': 'targetUsers',
  'expected users': 'targetUsers',
  'expected scale': 'expectedScale',
  'expected outcome': 'expectedOutcome',
  'target platform': 'targetPlatform',
  platform: 'targetPlatform',
  'existing system': 'existingSystem',
  integration: 'integration',
  constraint: 'constraint',
  constraints: 'constraint',
  technology: 'technology',
  deliverables: 'deliverables',
  dependencies: 'dependencies',
  deadline: 'deadline',
  priority: 'priority',
  budget: 'budget',
  assumption: 'assumption',
  source: 'source',
  'start date': 'startDate',
  'project id': 'projectId',
  'business domain': 'businessDomain',
  'in scope': 'inScope',
  'out of scope': 'outOfScope',
});

function normalizeTemplateTypeToken(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function isCustomerRawTemplateType(raw) {
  const token = normalizeTemplateTypeToken(raw);
  if (!token) return false;
  if (token === 'customerraw' || token === 'customerrequirementraw') return true;
  return token.includes('customerrequirementraw') || token.endsWith('customerraw');
}

/**
 * Sheet fingerprint when Meta.TemplateType missing / renamed
 * (filled workbooks often keep Raw sheets but drop or alter TemplateType).
 */
function looksLikeCustomerRawWorkbook(workbook) {
  const names = new Set((workbook?.SheetNames || []).map((n) => String(n || '')));
  if (!names.has(CUSTOMER_RAW_SHEETS.CONTEXT)) return false;
  // SRS uses 03_Functional_Requirements / 04_Non_Functional — not these Raw ids.
  const rawMarkers = [
    CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
    CUSTOMER_RAW_SHEETS.REQUIREMENT,
    CUSTOMER_RAW_SHEETS.REFERENCE,
  ];
  return rawMarkers.some((sheet) => names.has(sheet));
}

function sheetToMatrix(workbook, sheetName) {
  const ws = workbook.Sheets[sheetName];
  if (!ws) return null;
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
}

function readMeta(workbook) {
  const matrix = sheetToMatrix(workbook, CUSTOMER_RAW_SHEETS.META);
  const meta = {
    templateType: '',
    templateVersion: '',
    projectName: '',
    customerName: '',
  };
  if (!matrix) return meta;
  for (let i = 1; i < matrix.length; i += 1) {
    const key = normHeader(matrix[i]?.[0]);
    const value = normProse(matrix[i]?.[1]);
    if (key === 'templatetype' || key === 'template type') meta.templateType = value;
    if (key === 'templateversion' || key === 'template version') meta.templateVersion = value;
    if (key === 'projectname' || key === 'project name') meta.projectName = value;
    if (key === 'customername' || key === 'customer name') meta.customerName = value;
  }
  return meta;
}

function parseContextSheet(workbook) {
  const matrix = sheetToMatrix(workbook, CUSTOMER_RAW_SHEETS.CONTEXT);
  const context = {};
  if (!matrix?.length) {
    return { context, present: false, rowCount: 0 };
  }

  const headerRow = (matrix[0] || []).map((h) => String(h || ''));
  const normalized = headerRow.map((h) => normHeader(h));
  const fieldIdx = normalized.indexOf('field');
  const valueIdx = normalized.indexOf('value');
  if (fieldIdx < 0) {
    return { context, present: false, rowCount: 0 };
  }

  let rowCount = 0;
  for (let r = 1; r < matrix.length; r += 1) {
    const line = matrix[r] || [];
    const fieldLabel = normHeader(line[fieldIdx]);
    if (!fieldLabel) continue;
    const key = CONTEXT_LABEL_ALIASES[fieldLabel];
    if (!key) continue;
    const value = normProse(valueIdx >= 0 ? line[valueIdx] : '');
    if (!value) continue;
    // First non-empty wins; later duplicate labels ignored.
    if (context[key] == null || context[key] === '') {
      context[key] = value;
      rowCount += 1;
    }
  }

  return { context, present: true, rowCount };
}

/**
 * Peek Meta / sheet fingerprint for Customer Raw routing (import preview).
 * @param {Buffer|ArrayBuffer|Uint8Array} fileBuffer
 * @returns {string} canonical CustomerRaw when matched, else Meta TemplateType or ''
 */
function peekCustomerRawTemplateType(fileBuffer) {
  try {
    const buffer = Buffer.isBuffer(fileBuffer)
      ? fileBuffer
      : Buffer.from(fileBuffer || []);
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const meta = readMeta(workbook);
    if (isCustomerRawTemplateType(meta.templateType)) return CUSTOMER_RAW_TEMPLATE_TYPE;
    if (looksLikeCustomerRawWorkbook(workbook)) return CUSTOMER_RAW_TEMPLATE_TYPE;
    return meta.templateType || '';
  } catch {
    return '';
  }
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array} fileBuffer
 * @returns {{
 *   templateType: string,
 *   templateVersion: string,
 *   isCustomerRaw: boolean,
 *   meta: object,
 *   context: Record<string, string>,
 *   contextSheetPresent: boolean,
 *   contextValueCount: number,
 * }}
 */
function parseCustomerRawContext(fileBuffer) {
  const buffer = Buffer.isBuffer(fileBuffer)
    ? fileBuffer
    : Buffer.from(fileBuffer || []);
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const meta = readMeta(workbook);
  const { context, present, rowCount } = parseContextSheet(workbook);
  let templateType = meta.templateType || '';
  let isCustomerRaw = isCustomerRawTemplateType(templateType);
  if (!isCustomerRaw && looksLikeCustomerRawWorkbook(workbook)) {
    isCustomerRaw = true;
    if (!templateType) templateType = CUSTOMER_RAW_TEMPLATE_TYPE;
  }
  return {
    templateType,
    templateVersion: meta.templateVersion || '',
    isCustomerRaw,
    meta,
    context,
    contextSheetPresent: present,
    contextValueCount: rowCount,
    expectedContextColumns: CUSTOMER_RAW_SHEET_COLUMNS[CUSTOMER_RAW_SHEETS.CONTEXT],
    templateTypeCanonical: CUSTOMER_RAW_TEMPLATE_TYPE,
  };
}

module.exports = {
  parseCustomerRawContext,
  isCustomerRawTemplateType,
  looksLikeCustomerRawWorkbook,
  peekCustomerRawTemplateType,
  normalizeTemplateTypeToken,
  CONTEXT_LABEL_ALIASES,
  readMeta,
  parseContextSheet,
};
