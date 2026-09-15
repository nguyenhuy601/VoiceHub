/**
 * Requirement Analysis workbook SSOT (ADR 0003) — BA WHAT only.
 * Not SRS.xlsx (AI/Admin intake). Not Customer Raw.
 */

const ANALYSIS_TEMPLATE_VERSION = '2.1-analysis';
const ANALYSIS_TEMPLATE_FILE_NAME = 'Requirement_Analysis.xlsx';
const ANALYSIS_TEMPLATE_TYPE = 'RequirementAnalysis';

const ANALYSIS_SHEETS = Object.freeze({
  META: '00_Meta',
  README: 'README',
  TRACEABILITY: '01_Traceability',
  BG: '02_BG',
  BR: '03_BR',
  BPM: '04_BPM',
  FR: '05_FR',
  UC: '06_UC',
  NFR: '07_NFR',
});

const ANALYSIS_REQUIRED_SHEETS = Object.freeze([
  ANALYSIS_SHEETS.TRACEABILITY,
  ANALYSIS_SHEETS.FR,
  ANALYSIS_SHEETS.NFR,
]);

const ANALYSIS_OPTIONAL_DATA_SHEETS = Object.freeze([
  ANALYSIS_SHEETS.BG,
  ANALYSIS_SHEETS.BR,
  ANALYSIS_SHEETS.BPM,
  ANALYSIS_SHEETS.UC,
]);

const ANALYSIS_PRIORITIES = Object.freeze(['Critical', 'High', 'Medium', 'Low']);

const ANALYSIS_STATUSES = Object.freeze(['Draft', 'Reviewed', 'Approved']);

const ANALYSIS_TRACE_STATUSES = Object.freeze(['Analyzed', 'Clarification', 'Rejected']);

const ANALYSIS_TRACE_RELATIONSHIPS = Object.freeze([
  'Derived',
  'Refined',
  'Split',
  'Merged',
  'Duplicate',
]);

const ANALYSIS_TYPES = Object.freeze(['BG', 'BR', 'BPM', 'FR', 'UC', 'NFR']);

/** Analysis FR hierarchy (Capability is Analysis-only; SRS intake stays 3-level). */
const ANALYSIS_FR_LEVELS = Object.freeze(['Module', 'Capability', 'Feature', 'Requirement']);

const ANALYSIS_FR_VALID_PARENT_LEVELS = Object.freeze({
  Module: [],
  Capability: ['Module'],
  Feature: ['Capability', 'Module'],
  Requirement: ['Feature'],
});

const ANALYSIS_SHEET_COLUMNS = Object.freeze({
  [ANALYSIS_SHEETS.META]: ['Key', 'Value'],
  [ANALYSIS_SHEETS.README]: ['Topic', 'Guidance'],
  [ANALYSIS_SHEETS.TRACEABILITY]: [
    'Analysis ID',
    'Analysis Type',
    'Customer Requirement ID',
    'Source Reference',
    'Relationship',
    'Analysis Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.BG]: [
    'BG ID',
    'Customer Requirement IDs',
    'Goal',
    'Business Problem',
    'Expected Business Outcome',
    'Success Criteria',
    'Priority',
    'Stakeholder',
    'Assumption',
    'Constraint',
    'Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.BR]: [
    'BR ID',
    'BG ID',
    'Customer Requirement IDs',
    'Business Requirement',
    'Business Rule',
    'Stakeholder',
    'Priority',
    'Success Criteria',
    'Dependency',
    'Assumption',
    'Constraint',
    'Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.BPM]: [
    'BPM ID',
    'BR ID',
    'Process Name',
    'Process Description',
    'Trigger',
    'Actor / Role',
    'Precondition',
    'Step No',
    'Process Step',
    'Input',
    'Output',
    'Business Rule',
    'Exception',
    'Related CR',
    'Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.FR]: [
    'FR ID',
    'Parent ID',
    'Level',
    'Module',
    'Capability',
    'Feature',
    'Requirement',
    'Customer Requirement IDs',
    'BR IDs',
    'BPM IDs',
    'Actor',
    'Trigger',
    'Precondition',
    'Main Behavior',
    'Business Rule',
    'Input',
    'Output',
    'Exception',
    'Acceptance Criteria',
    'Priority',
    'Dependency',
    'Assumption',
    'Constraint',
    'Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.UC]: [
    'UC ID',
    'FR IDs',
    'BR IDs',
    'Customer Requirement IDs',
    'Use Case Name',
    'Goal',
    'Primary Actor',
    'Secondary Actor',
    'Trigger',
    'Preconditions',
    'Postconditions',
    'Main Flow',
    'Alternative Flow',
    'Exception Flow',
    'Business Rules',
    'Input',
    'Output',
    'Priority',
    'Status',
    'BA Note',
  ],
  [ANALYSIS_SHEETS.NFR]: [
    'NFR ID',
    'Customer Requirement IDs',
    'Category',
    'Requirement',
    'Target',
    'Measurement',
    'Priority',
    'Scope',
    'Constraint',
    'Acceptance Criteria',
    'Source',
    'Status',
    'BA Note',
  ],
});

/** Columns that must appear in header when sheet is present */
const ANALYSIS_SHEET_REQUIRED_COLUMNS = Object.freeze({
  [ANALYSIS_SHEETS.TRACEABILITY]: [
    'Analysis ID',
    'Analysis Type',
    'Customer Requirement ID',
    'Relationship',
    'Analysis Status',
  ],
  [ANALYSIS_SHEETS.FR]: ['FR ID', 'Parent ID', 'Level', 'Module', 'Feature', 'Requirement', 'Priority'],
  [ANALYSIS_SHEETS.NFR]: ['NFR ID', 'Category', 'Requirement', 'Priority'],
  [ANALYSIS_SHEETS.BG]: ['BG ID', 'Goal'],
  [ANALYSIS_SHEETS.BR]: ['BR ID', 'Business Requirement'],
  [ANALYSIS_SHEETS.BPM]: ['BPM ID', 'Process Name', 'Step No', 'Process Step'],
  [ANALYSIS_SHEETS.UC]: ['UC ID', 'Use Case Name'],
});

const ANALYSIS_README_ROWS = Object.freeze([
  [
    'Purpose',
    'Requirement Analysis (BA WHAT): normalize and decompose Customer Requirements. Not Customer Raw. Not SRS.xlsx (AI intake). Not SrsBaseline DB snapshot. Not Project Plan.',
  ],
  [
    'Sheets',
    '01_Traceability (required) + 02_BG … 07_NFR. Trace every Analysis ID back to Customer Requirement ID (CR-* from Raw 03_Requirement).',
  ],
  [
    'Flow',
    'Customer Raw → fill Analysis → import/seed artifacts → approve → cut SrsBaseline → Planning. AI Analysis Blueprint uses SRS.xlsx pack, not this workbook.',
  ],
  [
    'NFR Target',
    'Leave Target blank unless grounded in customer, standard, or confirmed decision. Do not invent targets.',
  ],
]);

module.exports = {
  ANALYSIS_TEMPLATE_VERSION,
  ANALYSIS_TEMPLATE_FILE_NAME,
  ANALYSIS_TEMPLATE_TYPE,
  ANALYSIS_SHEETS,
  ANALYSIS_REQUIRED_SHEETS,
  ANALYSIS_OPTIONAL_DATA_SHEETS,
  ANALYSIS_PRIORITIES,
  ANALYSIS_STATUSES,
  ANALYSIS_TRACE_STATUSES,
  ANALYSIS_TRACE_RELATIONSHIPS,
  ANALYSIS_TYPES,
  ANALYSIS_FR_LEVELS,
  ANALYSIS_FR_VALID_PARENT_LEVELS,
  ANALYSIS_SHEET_COLUMNS,
  ANALYSIS_SHEET_REQUIRED_COLUMNS,
  ANALYSIS_README_ROWS,
};
