/**
 * Requirement Template — Standard Format v2.0 (WHAT-only).
 * Source of truth: assets/Requirement_Template.xlsx
 * FR levels: Module | Feature | Requirement. No Role/Skill/Effort on FR.
 */

const TEMPLATE_VERSION = '2.0';
const TEMPLATE_FILE_NAME = 'Requirement_Template.xlsx';
/** Only Standard Format v2 accepted on ship path */
const COMPATIBLE_TEMPLATE_VERSIONS = Object.freeze(['2.0']);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FR_ROWS = 2000;
const FR_ROW_WARN_THRESHOLD = 500;
const IMPORT_SESSION_TTL_HOURS = 24;

const SHEETS = Object.freeze({
  META: '00_Meta',
  README: 'README',
  CONTEXT: '01_Project_Context',
  /** @deprecated alias */
  OVERVIEW: '01_Project_Context',
  STAKEHOLDERS: '02_Stakeholders',
  /** Legacy separate scope sheet — optional; Standard Format embeds In/Out Scope in Context */
  SCOPE: '02_Scope',
  FUNCTIONAL: '03_Functional_Requirements',
  NFR: '04_Non_Functional',
  TECHNOLOGY: '05_Technology',
  INTEGRATION: '06_Integration',
  CONSTRAINTS: '07_Constraints',
  DEPENDENCIES: '08_Dependencies',
  ASSUMPTIONS: '09_Assumptions',
  METADATA: '10_Requirement_Metadata',
  AI_OUTPUT: '11_AI_Analysis_Output',
});

const REQUIRED_SHEETS = Object.freeze([
  SHEETS.CONTEXT,
  SHEETS.FUNCTIONAL,
  SHEETS.NFR,
]);

const OPTIONAL_SHEETS = Object.freeze([
  SHEETS.META,
  SHEETS.README,
  SHEETS.STAKEHOLDERS,
  SHEETS.SCOPE,
  SHEETS.TECHNOLOGY,
  SHEETS.INTEGRATION,
  SHEETS.CONSTRAINTS,
  SHEETS.DEPENDENCIES,
  SHEETS.ASSUMPTIONS,
  SHEETS.METADATA,
  SHEETS.AI_OUTPUT,
]);

const ALL_SHEETS = Object.freeze([...REQUIRED_SHEETS, ...OPTIONAL_SHEETS]);

const PRIORITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);

/** v2 WHAT hierarchy */
const FR_LEVELS = Object.freeze(['Module', 'Feature', 'Requirement']);

const FR_VALID_PARENT_LEVELS = Object.freeze({
  Module: [],
  Feature: ['Module'],
  Requirement: ['Feature'],
});

/** Columns required on FR sheet header (structure) */
const FR_REQUIRED_COLUMNS = Object.freeze([
  'ID',
  'Level',
  'Parent ID',
  'Module',
  'Feature',
  'Requirement',
  'Priority',
]);

/** Optional FR WHAT columns — never staffing-required */
const FR_OPTIONAL_COLUMNS = Object.freeze([
  'Description',
  'Actor',
  'Trigger',
  'Preconditions',
  'Main Flow',
  'Alternative / Exception Flow',
  'Exception Flow',
  'Business Rules',
  'Input',
  'Output',
  'Data / Entities',
  'Acceptance Criteria',
  'Dependencies',
  'Constraints / Notes',
  'Name',
]);

const SCOPE_TYPES = Object.freeze(['In Scope', 'Out of Scope']);

const INTEGRATION_DIRECTIONS = Object.freeze(['Inbound', 'Outbound', 'Bidirectional']);

/**
 * Context Field labels (Standard Format) → internal overview keys.
 * requirementName is derived from projectObjective when missing.
 */
const OVERVIEW_FIELDS = Object.freeze([
  { key: 'projectObjective', label: 'Project Objective', required: true },
  { key: 'businessScope', label: 'Business Scope', required: true },
  { key: 'expectedUsers', label: 'Expected Users / Scale', required: true },
  { key: 'platform', label: 'Platform', required: true },
  { key: 'priority', label: 'Priority', required: true },
  { key: 'deadline', label: 'Deadline', required: true },
  { key: 'budget', label: 'Budget', required: false },
  { key: 'specialNotes', label: 'Special Notes', required: false },
  { key: 'requirementName', label: 'Requirement Name', required: false },
  { key: 'expectedScale', label: 'Expected Scale', required: false },
  { key: 'startDate', label: 'Start Date', required: false },
  { key: 'budgetCurrency', label: 'Budget Currency', required: false },
]);

const CONTEXT_SCOPE_LABELS = Object.freeze({
  in: 'In Scope',
  out: 'Out of Scope',
});

const SHEET_COLUMNS = Object.freeze({
  [SHEETS.CONTEXT]: ['Field', 'Value', 'Description / Guidance'],
  [SHEETS.SCOPE]: ['Scope Type', 'Description'],
  [SHEETS.STAKEHOLDERS]: [
    'ID',
    'Stakeholder / Actor',
    'Type',
    'Role / Responsibility',
    'Interest / Need',
    'Notes',
  ],
  [SHEETS.FUNCTIONAL]: [...FR_REQUIRED_COLUMNS, ...FR_OPTIONAL_COLUMNS],
  [SHEETS.NFR]: [
    'ID',
    'Category',
    'Requirement',
    'Target',
    'Priority',
    'Verification / Acceptance',
  ],
  [SHEETS.TECHNOLOGY]: ['Category', 'Technology', 'Version', 'Mandatory', 'Purpose / Note', 'Note'],
  [SHEETS.INTEGRATION]: [
    'System',
    'Integration Type',
    'Direction',
    'Description',
    'Required',
    'Interface / Notes',
  ],
  [SHEETS.CONSTRAINTS]: ['ID', 'Type', 'Description', 'Priority'],
  [SHEETS.DEPENDENCIES]: [
    'ID',
    'Type',
    'Dependency',
    'Description',
    'Impact if Unavailable',
    'Required',
    'Required Date',
    'Impact',
  ],
  [SHEETS.ASSUMPTIONS]: [
    'ID',
    'Assumption',
    'Rationale / Context',
    'Validation Status',
    'Impact if Invalid',
  ],
  [SHEETS.METADATA]: [
    'Requirement ID',
    'Business Priority Rationale',
    'Known Complexity Hint',
    'Data Sensitivity',
    'Expected Frequency / Volume',
    'Open Question',
    'Source / Reference',
    'Field',
    'Value',
  ],
  [SHEETS.AI_OUTPUT]: [
    'Requirement ID',
    'Capability',
    'Inferred Data / Entity',
    'Suggested Technical Area',
    'Suggested Role',
    'Suggested Skills',
    'Suggested WBS / Task',
    'Complexity',
    'Effort (AI/Engine)',
    'Risks',
    'Confidence',
    'Human Review Status',
  ],
  [SHEETS.META]: ['Key', 'Value'],
});

const SHEET_REQUIRED_COLUMNS = Object.freeze({
  [SHEETS.CONTEXT]: ['Field', 'Value'],
  [SHEETS.FUNCTIONAL]: FR_REQUIRED_COLUMNS,
  [SHEETS.NFR]: ['ID', 'Category', 'Requirement', 'Target', 'Priority'],
});

const ID_PREFIXES = Object.freeze({
  functional: 'FR-',
  nfr: 'NFR-',
  dependency: 'DEP-',
  assumption: 'ASM-',
});

function isTemplateV2(templateVersion) {
  const v = String(templateVersion || '').trim();
  return v === '2.0' || /^2\./.test(v);
}

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
  INTEGRATION_DIRECTIONS,
  OVERVIEW_FIELDS,
  CONTEXT_SCOPE_LABELS,
  SHEET_COLUMNS,
  SHEET_REQUIRED_COLUMNS,
  ID_PREFIXES,
  isTemplateV2,
};
