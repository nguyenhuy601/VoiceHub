/**
 * Requirement Template — canonical schema (v1.1).
 * Org-scoped RequirementPack lives in project-service.
 * v1.0 files remain importable (optional staffing columns).
 */

const TEMPLATE_VERSION = '1.1';
const TEMPLATE_FILE_NAME = 'Requirement_Template_v1.1.xlsx';
/** Uploaded Meta versions accepted without error */
const COMPATIBLE_TEMPLATE_VERSIONS = Object.freeze(['1.0', '1.1']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FR_ROWS = 2000;
const FR_ROW_WARN_THRESHOLD = 500;
const IMPORT_SESSION_TTL_HOURS = 24;

const SHEETS = Object.freeze({
  META: '00_Meta',
  README: 'README',
  OVERVIEW: '01_Project_Overview',
  SCOPE: '02_Scope',
  FUNCTIONAL: '03_Functional_Requirements',
  NFR: '04_Non_Functional',
  TECHNOLOGY: '05_Technology',
  INTEGRATION: '06_Integration',
  CONSTRAINTS: '07_Constraints',
  DEPENDENCIES: '08_Dependencies',
  ASSUMPTIONS: '09_Assumptions',
});

const REQUIRED_SHEETS = Object.freeze([
  SHEETS.OVERVIEW,
  SHEETS.SCOPE,
  SHEETS.FUNCTIONAL,
  SHEETS.NFR,
]);

const OPTIONAL_SHEETS = Object.freeze([
  SHEETS.META,
  SHEETS.README,
  SHEETS.TECHNOLOGY,
  SHEETS.INTEGRATION,
  SHEETS.CONSTRAINTS,
  SHEETS.DEPENDENCIES,
  SHEETS.ASSUMPTIONS,
]);

const ALL_SHEETS = Object.freeze([...REQUIRED_SHEETS, ...OPTIONAL_SHEETS, SHEETS.META, SHEETS.README]);

const PRIORITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);

const FR_LEVELS = Object.freeze(['Module', 'Capability', 'Feature', 'Requirement']);

/** Valid parent levels for each FR level (Parent ID may be empty only for Module). */
const FR_VALID_PARENT_LEVELS = Object.freeze({
  Module: [],
  Capability: ['Module'],
  Feature: ['Capability', 'Module'],
  Requirement: ['Feature', 'Capability'],
});

const FR_REQUIRED_COLUMNS = Object.freeze([
  'ID',
  'Level',
  'Parent ID',
  'Name',
  'Description',
  'Priority',
  'Acceptance Criteria',
]);

/** v1.1 — columns optional in header (v1.0 compat); values required on each Requirement leaf */
const FR_OPTIONAL_COLUMNS = Object.freeze([
  'Suggested Skills',
  'Effort Hours',
  'Suggested Role',
]);

const SCOPE_TYPES = Object.freeze(['In Scope', 'Out of Scope']);

const NFR_CATEGORIES = Object.freeze([
  'Performance',
  'Security',
  'Availability',
  'Scalability',
  'Maintainability',
  'Usability',
  'Compliance',
  'Reliability',
]);

const INTEGRATION_DIRECTIONS = Object.freeze(['Inbound', 'Outbound', 'Bidirectional']);

const OVERVIEW_FIELDS = Object.freeze([
  { key: 'requirementName', label: 'Requirement Name', required: true },
  { key: 'projectObjective', label: 'Project Objective', required: true },
  { key: 'businessScope', label: 'Business Scope', required: true },
  { key: 'platform', label: 'Platform', required: true },
  { key: 'expectedUsers', label: 'Expected Users', required: true },
  { key: 'expectedScale', label: 'Expected Scale', required: false },
  { key: 'deadline', label: 'Deadline', required: true },
  { key: 'startDate', label: 'Start Date', required: false },
  { key: 'budget', label: 'Budget', required: false },
  { key: 'budgetCurrency', label: 'Budget Currency', required: false },
  { key: 'priority', label: 'Priority', required: true },
]);

const SHEET_COLUMNS = Object.freeze({
  [SHEETS.OVERVIEW]: ['Field', 'Required', 'Value'],
  [SHEETS.SCOPE]: ['Scope Type', 'Description'],
  [SHEETS.FUNCTIONAL]: [...FR_REQUIRED_COLUMNS, ...FR_OPTIONAL_COLUMNS],
  [SHEETS.NFR]: ['ID', 'Category', 'Requirement', 'Target', 'Priority'],
  [SHEETS.TECHNOLOGY]: ['Category', 'Technology', 'Version', 'Mandatory', 'Note'],
  [SHEETS.INTEGRATION]: ['System', 'Integration Type', 'Direction', 'Description', 'Required'],
  [SHEETS.CONSTRAINTS]: ['Type', 'Description'],
  [SHEETS.DEPENDENCIES]: ['ID', 'Dependency', 'Type', 'Required Date', 'Impact'],
  [SHEETS.ASSUMPTIONS]: ['ID', 'Assumption', 'Impact if Invalid'],
  [SHEETS.META]: ['Key', 'Value'],
});

/** Columns that must exist on sheet for structure validation */
const SHEET_REQUIRED_COLUMNS = Object.freeze({
  [SHEETS.OVERVIEW]: SHEET_COLUMNS[SHEETS.OVERVIEW],
  [SHEETS.SCOPE]: SHEET_COLUMNS[SHEETS.SCOPE],
  [SHEETS.FUNCTIONAL]: FR_REQUIRED_COLUMNS,
  [SHEETS.NFR]: SHEET_COLUMNS[SHEETS.NFR],
});

const ID_PREFIXES = Object.freeze({
  functional: 'FR-',
  nfr: 'NFR-',
  dependency: 'DEP-',
  assumption: 'ASM-',
});

module.exports = {
  TEMPLATE_VERSION,
  TEMPLATE_FILE_NAME,
  COMPATIBLE_TEMPLATE_VERSIONS,
  MAX_FILE_BYTES,
  MAX_FR_ROWS,
  FR_ROW_WARN_THRESHOLD,
  IMPORT_SESSION_TTL_HOURS,
  SHEETS,
  REQUIRED_SHEETS,
  OPTIONAL_SHEETS,
  ALL_SHEETS,
  PRIORITIES,
  FR_LEVELS,
  FR_VALID_PARENT_LEVELS,
  FR_REQUIRED_COLUMNS,
  FR_OPTIONAL_COLUMNS,
  SCOPE_TYPES,
  NFR_CATEGORIES,
  INTEGRATION_DIRECTIONS,
  OVERVIEW_FIELDS,
  SHEET_COLUMNS,
  SHEET_REQUIRED_COLUMNS,
  ID_PREFIXES,
};
