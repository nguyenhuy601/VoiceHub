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

function isCustomerRawTemplateType(raw) {
  return (
    String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '') === 'customerraw'
  );
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
  const templateType = meta.templateType || '';
  return {
    templateType,
    templateVersion: meta.templateVersion || '',
    isCustomerRaw: isCustomerRawTemplateType(templateType),
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
  CONTEXT_LABEL_ALIASES,
  readMeta,
  parseContextSheet,
};
