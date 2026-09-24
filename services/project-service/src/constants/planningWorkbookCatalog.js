/**
 * Planning workbook catalog — SoT cột / sheet (DEC D-WB1…D-WB4).
 * VoiceHub subset of PMBOK/ClickUp/Base fields — not full RA catalog.
 */

const { PLANNING_ARTIFACT_KINDS } = require('./planningArtifact');

/** Bump when sheet columns change incompatibly. */
const PLANNING_WORKBOOK_SCHEMA_VERSION = '1.0.0';

const META_SHEET = '00_Meta';
const RESOURCE_ROLES_SHEET = 'RESOURCE_ROLES';

/** Max data rows per kind sheet (excluding header). */
const PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET = 500;

/** Max total artifact rows after merge (excl. roles-only). */
const PLANNING_WORKBOOK_MAX_ROWS_TOTAL = 2000;

/**
 * Column defs: key = header in xlsx; required for kind sheets.
 * parentExternalKey only on WBS (tree). Other kinds are flat lists.
 * structuredKeys map into PlanningArtifact.structured (not top-level).
 */
const COMMON_COLS = Object.freeze([
  { key: 'externalKey', required: true },
  { key: 'title', required: true },
  { key: 'summary', required: false },
]);

const SHEET_COLUMNS = Object.freeze({
  WBS: [
    ...COMMON_COLS,
    { key: 'parentExternalKey', required: false },
    { key: 'startDate', required: false, structured: true },
    { key: 'endDate', required: false, structured: true },
    { key: 'effortHours', required: false, structured: true },
    { key: 'assigneeEmail', required: false, structured: true },
    { key: 'assigneeName', required: false, structured: true },
    { key: 'sourceFrKey', required: false, structured: true },
    { key: 'skillKeys', required: false, structured: true },
  ],
  ARCHITECTURE: [
    ...COMMON_COLS,
    { key: 'body', required: false, topLevel: true },
    { key: 'techStack', required: false, structured: true },
    { key: 'diagramRef', required: false, structured: true },
  ],
  RESOURCE: [...COMMON_COLS, { key: 'effortHours', required: false, structured: true }],
  DEPENDENCY: [
    ...COMMON_COLS,
    { key: 'fromKey', required: true, structured: true },
    { key: 'toKey', required: true, structured: true },
    { key: 'dependencyType', required: false, structured: true },
    { key: 'lagDays', required: false, structured: true },
  ],
  SCHEDULE: [
    ...COMMON_COLS,
    { key: 'startDate', required: true, structured: true },
    { key: 'endDate', required: true, structured: true },
    { key: 'phaseKey', required: false, structured: true },
  ],
  MILESTONE: [
    ...COMMON_COLS,
    { key: 'targetDate', required: true, structured: true },
    { key: 'targetPhase', required: false, structured: true },
  ],
  RELEASE: [
    ...COMMON_COLS,
    { key: 'targetDate', required: true, structured: true },
    { key: 'startDate', required: false, structured: true },
    { key: 'endDate', required: false, structured: true },
  ],
  RISK: [
    ...COMMON_COLS,
    { key: 'impact', required: false, structured: true },
    { key: 'probability', required: false, structured: true },
    { key: 'sourceNfrKey', required: false, structured: true },
    { key: 'mitigation', required: false, structured: true },
  ],
});

/** RESOURCE_ROLES — 1 row = 1 role; merged into RESOURCE.structured.roles */
const RESOURCE_ROLES_COLUMNS = Object.freeze([
  { key: 'resourceExternalKey', required: true },
  { key: 'roleKey', required: true },
  { key: 'title', required: true },
  { key: 'count', required: false },
  { key: 'skillKeys', required: false },
  { key: 'effortHours', required: false },
  { key: 'notes', required: false },
]);

const META_COLUMNS = Object.freeze([
  { key: 'Key', required: true },
  { key: 'Value', required: false },
]);

function sheetNameForKind(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return PLANNING_ARTIFACT_KINDS.includes(k) ? k : null;
}

function columnsForSheet(sheetName) {
  const name = String(sheetName || '').trim();
  if (name === META_SHEET) return META_COLUMNS;
  if (name === RESOURCE_ROLES_SHEET) return RESOURCE_ROLES_COLUMNS;
  const k = sheetNameForKind(name);
  return k ? SHEET_COLUMNS[k] : null;
}

function requiredKeysForSheet(sheetName) {
  const cols = columnsForSheet(sheetName);
  if (!cols) return [];
  return cols.filter((c) => c.required).map((c) => c.key);
}

function isPlanningWorkbookSheetName(name) {
  const n = String(name || '').trim();
  if (n === META_SHEET || n === RESOURCE_ROLES_SHEET) return true;
  return Boolean(sheetNameForKind(n));
}

/**
 * Detect multi-sheet Planning workbook vs legacy single "Planning" sheet.
 * @param {string[]} sheetNames
 */
function isMultiSheetPlanningWorkbook(sheetNames = []) {
  const names = Array.isArray(sheetNames) ? sheetNames : [];
  if (names.includes(META_SHEET)) return true;
  if (names.includes(RESOURCE_ROLES_SHEET)) return true;
  return PLANNING_ARTIFACT_KINDS.some((k) => names.includes(k));
}

function defaultSampleRow(kind) {
  const k = String(kind || '').toUpperCase();
  const base = {
    externalKey: `${k}-01`,
    title: `Example ${k}`,
    summary: '',
    parentExternalKey: '',
  };
  switch (k) {
    case 'WBS':
      return {
        ...base,
        startDate: '2026-10-01',
        endDate: '2026-10-15',
        effortHours: 40,
        assigneeEmail: '',
        assigneeName: '',
        sourceFrKey: '',
        skillKeys: '',
      };
    case 'ARCHITECTURE':
      return { ...base, body: '', techStack: '', diagramRef: '' };
    case 'RESOURCE':
      return { ...base, externalKey: 'RES-PLAN', title: 'Resource plan', effortHours: '' };
    case 'DEPENDENCY':
      return {
        ...base,
        fromKey: 'WBS-01',
        toKey: 'WBS-02',
        dependencyType: 'FS',
        lagDays: '',
      };
    case 'SCHEDULE':
      return {
        ...base,
        startDate: '2026-10-01',
        endDate: '2026-12-31',
        phaseKey: 'phase2',
      };
    case 'MILESTONE':
      return { ...base, targetDate: '2026-11-01', targetPhase: 'phase2' };
    case 'RELEASE':
      return {
        ...base,
        targetDate: '2026-12-15',
        startDate: '2026-12-01',
        endDate: '2026-12-15',
      };
    case 'RISK':
      return {
        ...base,
        impact: 'medium',
        probability: 'medium',
        sourceNfrKey: '',
        mitigation: '',
      };
    default:
      return base;
  }
}

function defaultResourceRolesSample() {
  return [
    {
      resourceExternalKey: 'RES-PLAN',
      roleKey: 'dev',
      title: 'Developer',
      count: 2,
      skillKeys: 'fullstack',
      effortHours: 160,
      notes: '',
    },
  ];
}

module.exports = {
  PLANNING_WORKBOOK_SCHEMA_VERSION,
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET,
  PLANNING_WORKBOOK_MAX_ROWS_TOTAL,
  SHEET_COLUMNS,
  RESOURCE_ROLES_COLUMNS,
  META_COLUMNS,
  sheetNameForKind,
  columnsForSheet,
  requiredKeysForSheet,
  isPlanningWorkbookSheetName,
  isMultiSheetPlanningWorkbook,
  defaultSampleRow,
  defaultResourceRolesSample,
};
