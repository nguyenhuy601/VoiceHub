/**
 * Planning workbook catalog — SoT cột / sheet (DEC D-WB1…D-WB4).
 * v1.1: Excel physical headers (ID/Name/…) map → domain fields (externalKey/title/…).
 */

const { PLANNING_ARTIFACT_KINDS } = require('./planningArtifact');

/** Bump when sheet columns change incompatibly. */
const PLANNING_WORKBOOK_SCHEMA_VERSION = '1.1.0';

const META_SHEET = '00_Meta';
const RESOURCE_ROLES_SHEET = 'RESOURCE_ROLES';

/** Max data rows per kind sheet (excluding header). */
const PLANNING_WORKBOOK_MAX_ROWS_PER_SHEET = 500;

/** Max total artifact rows after merge (excl. roles-only). */
const PLANNING_WORKBOOK_MAX_ROWS_TOTAL = 2000;

/**
 * Universal Excel headers (template Project_Planning_SRS_V1.0_Template_Based).
 * Domain field per kind is KIND_PHYSICAL_MAP / RESOURCE_ROLES_PHYSICAL_MAP.
 */
const PHYSICAL_HEADERS = Object.freeze([
  'ID',
  'Name',
  'Description',
  'Ref/Notes',
  'Start',
  'End',
  'Hours',
  'Extra1',
  'Extra2',
  'Extra3',
  'Extra4',
]);

/**
 * Physical header → domain key (empty string = unused for that kind).
 * Extra1–4 used mainly on WBS (assigneeEmail, assigneeName, sourceFrKey, skillKeys).
 */
const KIND_PHYSICAL_MAP = Object.freeze({
  WBS: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'parentExternalKey',
    Start: 'startDate',
    End: 'endDate',
    Hours: 'effortHours',
    Extra1: 'assigneeEmail',
    Extra2: 'assigneeName',
    Extra3: 'sourceFrKey',
    Extra4: 'skillKeys',
  }),
  ARCHITECTURE: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'body',
    Start: 'techStack',
    End: 'diagramRef',
    Hours: '',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  RESOURCE: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'effortHours',
    Start: '',
    End: '',
    Hours: '',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  DEPENDENCY: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'fromKey',
    Start: 'toKey',
    End: 'dependencyType',
    Hours: 'lagDays',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  SCHEDULE: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'startDate',
    Start: 'endDate',
    End: 'phaseKey',
    Hours: '',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  MILESTONE: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'targetDate',
    Start: 'targetPhase',
    End: '',
    Hours: '',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  RELEASE: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'targetDate',
    Start: 'startDate',
    End: 'endDate',
    Hours: '',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
  RISK: Object.freeze({
    ID: 'externalKey',
    Name: 'title',
    Description: 'summary',
    'Ref/Notes': 'impact',
    Start: 'probability',
    End: 'sourceNfrKey',
    Hours: 'mitigation',
    Extra1: '',
    Extra2: '',
    Extra3: '',
    Extra4: '',
  }),
});

/** RESOURCE_ROLES — physical → domain (merged into RESOURCE.structured.roles). */
const RESOURCE_ROLES_PHYSICAL_MAP = Object.freeze({
  ID: 'resourceExternalKey',
  Name: 'roleKey',
  Description: 'title',
  'Ref/Notes': 'count',
  Start: 'skillKeys',
  End: 'effortHours',
  Hours: 'notes',
  Extra1: '',
  Extra2: '',
  Extra3: '',
  Extra4: '',
});

/** Aliases: Excel header (any case) → canonical physical header. */
const PHYSICAL_HEADER_ALIASES = Object.freeze({
  id: 'ID',
  externalkey: 'ID',
  key: 'ID',
  name: 'Name',
  title: 'Name',
  description: 'Description',
  summary: 'Description',
  'ref/notes': 'Ref/Notes',
  refnotes: 'Ref/Notes',
  notes: 'Ref/Notes',
  start: 'Start',
  end: 'End',
  hours: 'Hours',
  extra1: 'Extra1',
  extra2: 'Extra2',
  extra3: 'Extra3',
  extra4: 'Extra4',
});

/**
 * Column defs (domain): key = domain field; required for kind sheets.
 * parentExternalKey only on WBS (tree). structured → PlanningArtifact.structured.
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

/** RESOURCE_ROLES — domain columns (1 row = 1 role). */
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

/** Meta Name-column heuristic order when template layout (no Key/Value). */
const META_NAME_HEURISTIC_KEYS = Object.freeze([
  'projectKey',
  'projectName',
  'seedFromRa',
  'schemaVersion',
  'projectId',
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

function physicalHeadersForSheet(sheetName) {
  const name = String(sheetName || '').trim();
  if (name === META_SHEET) return META_COLUMNS.map((c) => c.key);
  if (name === RESOURCE_ROLES_SHEET || sheetNameForKind(name)) {
    return [...PHYSICAL_HEADERS];
  }
  return [];
}

function physicalMapForSheet(sheetName) {
  const name = String(sheetName || '').trim();
  if (name === RESOURCE_ROLES_SHEET) return RESOURCE_ROLES_PHYSICAL_MAP;
  const k = sheetNameForKind(name);
  return k ? KIND_PHYSICAL_MAP[k] : null;
}

/** Normalize Excel header cell → canonical physical name, or null. */
function canonicalizePhysicalHeader(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (PHYSICAL_HEADERS.includes(s)) return s;
  const alias = PHYSICAL_HEADER_ALIASES[s.toLowerCase().replace(/\s+/g, '')];
  if (alias) return alias;
  const lower = s.toLowerCase();
  if (lower === 'ref/notes' || lower === 'ref notes') return 'Ref/Notes';
  return null;
}

/**
 * Map sheet_to_json row (physical and/or domain keys) → domain flat object.
 * Dual-read: camelCase 1.0.0 keys kept; physical headers remapped.
 * @param {string} sheetName kind or RESOURCE_ROLES
 * @param {Record<string, unknown>} rawRow
 * @returns {Record<string, unknown>}
 */
function domainItemFromPhysicalRow(sheetName, rawRow) {
  const map = physicalMapForSheet(sheetName);
  const out = {};
  if (!rawRow || typeof rawRow !== 'object') return out;

  // 1) Domain keys already present (legacy camelCase workbook)
  const domainCols =
    sheetName === RESOURCE_ROLES_SHEET
      ? RESOURCE_ROLES_COLUMNS
      : SHEET_COLUMNS[sheetNameForKind(sheetName)] || [];
  for (const c of domainCols) {
    if (rawRow[c.key] !== undefined && rawRow[c.key] !== null && String(rawRow[c.key]).trim() !== '') {
      out[c.key] = rawRow[c.key];
    }
  }

  // 2) Physical / aliased headers → domain (fill gaps; physical wins if both set empty domain)
  if (map) {
    for (const [rawKey, rawVal] of Object.entries(rawRow)) {
      const physical = canonicalizePhysicalHeader(rawKey);
      if (!physical) continue;
      const domain = map[physical];
      if (!domain) continue;
      const empty = out[domain] === undefined || out[domain] === null || String(out[domain]).trim() === '';
      if (empty && rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
        out[domain] = rawVal;
      }
    }
  }

  // 3) Common loose aliases not in PHYSICAL_HEADERS (parentKey, etc.)
  if (out.parentExternalKey == null || String(out.parentExternalKey).trim() === '') {
    if (rawRow.parentKey != null && String(rawRow.parentKey).trim()) out.parentExternalKey = rawRow.parentKey;
  }
  if (out.externalKey == null || String(out.externalKey).trim() === '') {
    if (rawRow.key != null && String(rawRow.key).trim()) out.externalKey = rawRow.key;
  }

  return out;
}

/**
 * Domain flat row → physical header cells for AOA write.
 * @param {string} sheetName
 * @param {Record<string, unknown>} domainRow
 * @returns {Record<string, unknown>} keyed by PHYSICAL_HEADERS
 */
function physicalRowFromDomain(sheetName, domainRow) {
  const map = physicalMapForSheet(sheetName);
  const out = {};
  for (const h of PHYSICAL_HEADERS) out[h] = '';
  if (!map || !domainRow) return out;

  const domainToPhysical = {};
  for (const [phys, domain] of Object.entries(map)) {
    if (domain) domainToPhysical[domain] = phys;
  }
  for (const [domain, phys] of Object.entries(domainToPhysical)) {
    const v = domainRow[domain];
    if (v === undefined || v === null) continue;
    out[phys] = v;
  }
  return out;
}

/** Physical header label for a domain key (for error messages). */
function physicalLabelForDomain(sheetName, domainKey) {
  const map = physicalMapForSheet(sheetName);
  if (!map) return domainKey;
  for (const [phys, domain] of Object.entries(map)) {
    if (domain === domainKey) return `${phys} (${domainKey})`;
  }
  return domainKey;
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
  PHYSICAL_HEADERS,
  KIND_PHYSICAL_MAP,
  RESOURCE_ROLES_PHYSICAL_MAP,
  PHYSICAL_HEADER_ALIASES,
  META_NAME_HEURISTIC_KEYS,
  SHEET_COLUMNS,
  RESOURCE_ROLES_COLUMNS,
  META_COLUMNS,
  sheetNameForKind,
  columnsForSheet,
  requiredKeysForSheet,
  isPlanningWorkbookSheetName,
  isMultiSheetPlanningWorkbook,
  physicalHeadersForSheet,
  physicalMapForSheet,
  canonicalizePhysicalHeader,
  domainItemFromPhysicalRow,
  physicalRowFromDomain,
  physicalLabelForDomain,
  defaultSampleRow,
  defaultResourceRolesSample,
};
