/**
 * Customer Raw Field Registry — TemplateVersion 1.1-raw (PLAN Semantic Contract P1).
 * column → { semantic, role }. Deterministic; no AI column inference.
 */

const {
  CUSTOMER_RAW_TEMPLATE_VERSION,
  CUSTOMER_RAW_SHEETS,
  CUSTOMER_RAW_CONTEXT_FIELDS,
  CUSTOMER_RAW_SHEET_COLUMNS,
} = require('./customerRawTemplate.constants');

/** Bump when registry semantics/roles change (independent of template file version). */
const REGISTRY_VERSION = 'raw-sem-v1';

const ROLES = Object.freeze({
  CONTENT: 'content',
  CLASSIFICATION: 'classification',
  PROVENANCE: 'provenance',
  CONTEXT: 'context',
  CONSTRAINT: 'constraint',
  TEMPLATE_POLICY: 'template_policy',
  IMPORT_METADATA: 'import_metadata',
});

/**
 * @typedef {{ semantic: string, role: string }} FieldBinding
 */

/** 00_Meta Key → binding (not requirement content). */
const META_KEY_REGISTRY = Object.freeze({
  templatetype: { semantic: 'template_type', role: ROLES.IMPORT_METADATA },
  templateversion: { semantic: 'template_version', role: ROLES.IMPORT_METADATA },
  language: { semantic: 'language', role: ROLES.IMPORT_METADATA },
  customername: { semantic: 'customer_identity', role: ROLES.IMPORT_METADATA },
  projectname: { semantic: 'project_identity', role: ROLES.IMPORT_METADATA },
  collectedby: { semantic: 'collected_by', role: ROLES.IMPORT_METADATA },
  collecteddate: { semantic: 'collected_date', role: ROLES.IMPORT_METADATA },
});

/** README Topic → template_policy (never requirement content). */
const README_TOPIC_REGISTRY = Object.freeze({
  purpose: { semantic: 'template_purpose', role: ROLES.TEMPLATE_POLICY },
  sheets: { semantic: 'template_sheet_contract', role: ROLES.TEMPLATE_POLICY },
  'next step': { semantic: 'pipeline_guidance', role: ROLES.TEMPLATE_POLICY },
  forbidden: { semantic: 'template_forbidden', role: ROLES.TEMPLATE_POLICY },
  'customer statement': { semantic: 'customer_statement_policy', role: ROLES.TEMPLATE_POLICY },
});

/** 01_Project_Context Field label → binding. */
const CONTEXT_FIELD_REGISTRY = Object.freeze({
  'project id': { semantic: 'project_identity', role: ROLES.CONTEXT },
  'project name': { semantic: 'project_identity', role: ROLES.CONTEXT },
  customer: { semantic: 'customer_identity', role: ROLES.CONTEXT },
  'business domain': { semantic: 'business_domain', role: ROLES.CONTENT },
  'project objective': { semantic: 'business_objective', role: ROLES.CONTENT },
  'business problem': { semantic: 'business_problem', role: ROLES.CONTENT },
  'business scope': { semantic: 'scope', role: ROLES.CONTENT },
  'in scope': { semantic: 'scope_in', role: ROLES.CONTENT },
  'out of scope': { semantic: 'scope_out', role: ROLES.CONTENT },
  'target users': { semantic: 'target_user', role: ROLES.CONTEXT },
  'expected outcome': { semantic: 'business_outcome', role: ROLES.CONTENT },
  'target platform': { semantic: 'platform_constraint', role: ROLES.CONSTRAINT },
  'existing system': { semantic: 'current_state', role: ROLES.CONTEXT },
  integration: { semantic: 'integration_requirement', role: ROLES.CONTEXT },
  constraint: { semantic: 'business_constraint', role: ROLES.CONSTRAINT },
  deadline: { semantic: 'deadline', role: ROLES.CONSTRAINT },
  budget: { semantic: 'budget_constraint', role: ROLES.CONSTRAINT },
  priority: { semantic: 'project_priority', role: ROLES.CLASSIFICATION },
  assumption: { semantic: 'assumption', role: ROLES.CONSTRAINT },
  source: { semantic: 'source_reference', role: ROLES.PROVENANCE },
});

/** 02_Business_Request columns. */
const BUSINESS_REQUEST_COLUMN_REGISTRY = Object.freeze({
  'request id': { semantic: 'business_request_identity', role: ROLES.CONTENT },
  'request title': { semantic: 'business_request_title', role: ROLES.CONTENT },
  'customer statement': { semantic: 'customer_statement', role: ROLES.CONTENT },
  'business problem': { semantic: 'business_problem', role: ROLES.CONTENT },
  'business goal': { semantic: 'business_goal', role: ROLES.CONTENT },
  'expected benefit': { semantic: 'business_benefit', role: ROLES.CONTENT },
  priority: { semantic: 'priority', role: ROLES.CLASSIFICATION },
  stakeholder: { semantic: 'stakeholder', role: ROLES.CONTEXT },
  source: { semantic: 'source_type', role: ROLES.PROVENANCE },
  'date raised': { semantic: 'raised_date', role: ROLES.PROVENANCE },
  notes: { semantic: 'customer_note', role: ROLES.CONSTRAINT },
});

/** 03_Requirement columns. */
const REQUIREMENT_COLUMN_REGISTRY = Object.freeze({
  'requirement id': { semantic: 'requirement_identity', role: ROLES.CONTENT },
  'request id': { semantic: 'business_request_reference', role: ROLES.CONTEXT },
  requirement: { semantic: 'functional_behavior', role: ROLES.CONTENT },
  'requirement type': { semantic: 'requirement_type', role: ROLES.CLASSIFICATION },
  'module / area': { semantic: 'functional_scope', role: ROLES.CONTEXT },
  'user / actor': { semantic: 'actor', role: ROLES.CONTEXT },
  priority: { semantic: 'priority', role: ROLES.CLASSIFICATION },
  'acceptance / expected result': {
    semantic: 'acceptance_condition',
    role: ROLES.CONSTRAINT,
  },
  source: { semantic: 'source_type', role: ROLES.PROVENANCE },
  'source detail': { semantic: 'source_detail', role: ROLES.PROVENANCE },
  stakeholder: { semantic: 'stakeholder', role: ROLES.CONTEXT },
  'date raised': { semantic: 'raised_date', role: ROLES.PROVENANCE },
  'customer notes': {
    semantic: 'customer_constraint_or_note',
    role: ROLES.CONSTRAINT,
  },
  'attachment / reference': {
    semantic: 'reference_identity',
    role: ROLES.PROVENANCE,
  },
});

/** 04_NFR columns. */
const NFR_COLUMN_REGISTRY = Object.freeze({
  'nfr id': { semantic: 'nfr_identity', role: ROLES.CONTENT },
  category: { semantic: 'quality_attribute', role: ROLES.CLASSIFICATION },
  'customer requirement': { semantic: 'quality_requirement', role: ROLES.CONTENT },
  target: { semantic: 'quality_target', role: ROLES.CONSTRAINT },
  priority: { semantic: 'priority', role: ROLES.CLASSIFICATION },
  source: { semantic: 'source_type', role: ROLES.PROVENANCE },
});

/** 05_Reference columns. */
const REFERENCE_COLUMN_REGISTRY = Object.freeze({
  'reference id': { semantic: 'reference_identity', role: ROLES.PROVENANCE },
  type: { semantic: 'reference_type', role: ROLES.PROVENANCE },
  name: { semantic: 'reference_title', role: ROLES.PROVENANCE },
  source: { semantic: 'reference_source', role: ROLES.PROVENANCE },
  date: { semantic: 'reference_date', role: ROLES.PROVENANCE },
  'related requirement': { semantic: 'reference_relation', role: ROLES.PROVENANCE },
});

const SHEET_COLUMN_REGISTRIES = Object.freeze({
  [CUSTOMER_RAW_SHEETS.META]: META_KEY_REGISTRY,
  [CUSTOMER_RAW_SHEETS.README]: README_TOPIC_REGISTRY,
  [CUSTOMER_RAW_SHEETS.CONTEXT]: CONTEXT_FIELD_REGISTRY,
  [CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST]: BUSINESS_REQUEST_COLUMN_REGISTRY,
  [CUSTOMER_RAW_SHEETS.REQUIREMENT]: REQUIREMENT_COLUMN_REGISTRY,
  [CUSTOMER_RAW_SHEETS.NFR]: NFR_COLUMN_REGISTRY,
  [CUSTOMER_RAW_SHEETS.REFERENCE]: REFERENCE_COLUMN_REGISTRY,
});

function normKey(raw) {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * @param {string} sheetName
 * @param {string} columnOrFieldLabel
 * @returns {FieldBinding|null}
 */
function lookupFieldBinding(sheetName, columnOrFieldLabel) {
  const sheet = String(sheetName || '').trim();
  const reg = SHEET_COLUMN_REGISTRIES[sheet];
  if (!reg) return null;
  return reg[normKey(columnOrFieldLabel)] || null;
}

/**
 * Assert registry covers every declared template column / context field.
 * @returns {{ ok: boolean, missing: string[] }}
 */
function assertRegistryCoversTemplateColumns() {
  const missing = [];
  for (const field of CUSTOMER_RAW_CONTEXT_FIELDS) {
    if (!lookupFieldBinding(CUSTOMER_RAW_SHEETS.CONTEXT, field.field)) {
      missing.push(`${CUSTOMER_RAW_SHEETS.CONTEXT}:${field.field}`);
    }
  }
  for (const sheet of [
    CUSTOMER_RAW_SHEETS.BUSINESS_REQUEST,
    CUSTOMER_RAW_SHEETS.REQUIREMENT,
    CUSTOMER_RAW_SHEETS.NFR,
    CUSTOMER_RAW_SHEETS.REFERENCE,
  ]) {
    const cols = CUSTOMER_RAW_SHEET_COLUMNS[sheet] || [];
    for (const col of cols) {
      if (!lookupFieldBinding(sheet, col)) {
        missing.push(`${sheet}:${col}`);
      }
    }
  }
  // Meta keys from defaults
  for (const key of [
    'TemplateType',
    'TemplateVersion',
    'Language',
    'CustomerName',
    'ProjectName',
    'CollectedBy',
    'CollectedDate',
  ]) {
    if (!lookupFieldBinding(CUSTOMER_RAW_SHEETS.META, key)) {
      missing.push(`${CUSTOMER_RAW_SHEETS.META}:${key}`);
    }
  }
  return { ok: missing.length === 0, missing };
}

module.exports = {
  REGISTRY_VERSION,
  ROLES,
  META_KEY_REGISTRY,
  README_TOPIC_REGISTRY,
  CONTEXT_FIELD_REGISTRY,
  BUSINESS_REQUEST_COLUMN_REGISTRY,
  REQUIREMENT_COLUMN_REGISTRY,
  NFR_COLUMN_REGISTRY,
  REFERENCE_COLUMN_REGISTRY,
  SHEET_COLUMN_REGISTRIES,
  lookupFieldBinding,
  assertRegistryCoversTemplateColumns,
  TEMPLATE_VERSION_PIN: CUSTOMER_RAW_TEMPLATE_VERSION,
};
