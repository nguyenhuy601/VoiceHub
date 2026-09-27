/**
 * Build Planning multi-sheet workbook (empty sample or seedFromRa).
 * DEC D-WB2: seed only when explicitly requested — no DB writes.
 */

const { PLANNING_ARTIFACT_KINDS } = require('../../constants/planningArtifact');
const {
  PLANNING_WORKBOOK_SCHEMA_VERSION,
  META_SHEET,
  RESOURCE_ROLES_SHEET,
  SHEET_COLUMNS,
  RESOURCE_ROLES_COLUMNS,
  defaultSampleRow,
  defaultResourceRolesSample,
} = require('../../constants/planningWorkbookCatalog');
const {
  displayHeaderForKey,
  exportHeadersForColumns,
} = require('../../constants/planningWorkbookAliases');
const { FIELD_GUIDE_SHEET, fieldGuideAoa, labelSuggestedHeader } = require('./planningFieldGuide');

function cell(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.map((x) => String(x || '').trim()).filter(Boolean).join(',');
  return v;
}

function rowToSheetObject(kind, row) {
  const cols = SHEET_COLUMNS[kind] || [];
  const out = {};
  for (const c of cols) {
    out[c.key] = cell(row[c.key]);
  }
  return out;
}

/**
 * @param {{
 *   project?: object,
 *   seedFromRa?: boolean,
 *   seed?: {
 *     byKind?: Record<string, object[]>,
 *     resourceRoles?: object[],
 *   },
 * }} opts
 * @returns {Buffer}
 */
function buildPlanningWorkbookBuffer(opts = {}) {
  const XLSX = require('xlsx');
  const seedFromRa = Boolean(opts.seedFromRa);
  const project = opts.project || {};
  const seed = opts.seed && typeof opts.seed === 'object' ? opts.seed : {};
  const byKind = seed.byKind && typeof seed.byKind === 'object' ? seed.byKind : {};

  const wb = XLSX.utils.book_new();

  const metaRows = [
    { Key: 'schemaVersion', Value: PLANNING_WORKBOOK_SCHEMA_VERSION },
    { Key: 'projectId', Value: String(project._id || project.id || '') },
    { Key: 'projectKey', Value: String(project.key || project.code || '') },
    { Key: 'projectName', Value: String(project.name || '') },
    { Key: 'seedFromRa', Value: seedFromRa ? '1' : '0' },
    { Key: 'generatedAt', Value: new Date().toISOString() },
    {
      Key: 'instructions',
      Value:
        'See sheet 01_FieldGuide for which columns to fill and which to leave blank so import can suggest Due Date and Assignee. Fill kind sheets (headers: Key, Parent Key, Title…). RESOURCE_ROLES links roles to RESOURCE Key. Import previews before confirm. Legacy camelCase headers still accepted.',
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), META_SHEET);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(fieldGuideAoa()), FIELD_GUIDE_SHEET);

  for (const kind of PLANNING_ARTIFACT_KINDS) {
    const cols = SHEET_COLUMNS[kind];
    const internalKeys = cols.map((c) => c.key);
    const headers = exportHeadersForColumns(cols).map((header) => labelSuggestedHeader(kind, header));
    let dataRows = Array.isArray(byKind[kind]) ? byKind[kind] : [];
    if (!dataRows.length) {
      dataRows = [defaultSampleRow(kind)];
    }
    const sheetRows = dataRows.map((r) => rowToSheetObject(kind, { ...defaultSampleRow(kind), ...r }));
    const aoa = [headers, ...sheetRows.map((r) => internalKeys.map((k) => r[k] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), kind);
  }

  const roleInternal = RESOURCE_ROLES_COLUMNS.map((c) => c.key);
  const roleHeaders = roleInternal.map((k) => displayHeaderForKey(k));
  let roleRows = Array.isArray(seed.resourceRoles) ? seed.resourceRoles : [];
  if (!roleRows.length) {
    roleRows = defaultResourceRolesSample();
  }
  const roleAoa = [
    roleHeaders,
    ...roleRows.map((r) => roleInternal.map((h) => cell(r[h]))),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(roleAoa), RESOURCE_ROLES_SHEET);

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

/**
 * Load seed row maps from approved RA (read-only). Pure data assembly — caller queries DB.
 * @param {{ frs?: object[], nfrs?: object[], assumptions?: unknown[], existingKeys?: Set<string> }} input
 */
function buildSeedMapsFromRa(input = {}) {
  const frs = Array.isArray(input.frs) ? input.frs : [];
  const nfrs = Array.isArray(input.nfrs) ? input.nfrs : [];
  const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
  const existingKeys = input.existingKeys instanceof Set ? input.existingKeys : new Set();

  const byKind = {
    WBS: [],
    RISK: [],
    RESOURCE: [{ externalKey: 'RES-PLAN', title: 'Resource plan', summary: 'Seeded roles — edit RESOURCE_ROLES' }],
    MILESTONE: [
      {
        externalKey: 'MS-PHASE2',
        title: 'Phase 2 start',
        targetDate: '',
        targetPhase: 'development',
      },
    ],
    SCHEDULE: [
      {
        externalKey: 'SCH-DELIVERY',
        title: 'Delivery schedule',
        startDate: '',
        endDate: '',
        phaseKey: 'delivery',
      },
    ],
    ARCHITECTURE: [],
    DEPENDENCY: [],
    RELEASE: [],
  };

  for (const fr of frs.slice(0, 40)) {
    const externalKey = `WBS-${fr.externalKey || fr._id}`.slice(0, 64);
    if (existingKeys.has(`WBS:${externalKey}`)) continue;
    byKind.WBS.push({
      externalKey,
      title: String(fr.title || fr.externalKey || 'WBS').slice(0, 240),
      summary: String(fr.summary || `Derived from FR ${fr.externalKey || ''}`).slice(0, 2000),
      sourceFrKey: fr.externalKey || '',
      effortHours: '',
      skillKeys: '',
      startDate: '',
      endDate: '',
      assigneeEmail: '',
      assigneeName: '',
      roleKey: '',
    });
  }

  for (const nfr of nfrs.slice(0, 20)) {
    const externalKey = `RISK-${nfr.externalKey || nfr._id}`.slice(0, 64);
    if (existingKeys.has(`RISK:${externalKey}`)) continue;
    byKind.RISK.push({
      externalKey,
      title: `Risk: ${nfr.title || nfr.externalKey}`.slice(0, 240),
      summary: String(nfr.summary || 'Derived from NFR constraint').slice(0, 2000),
      sourceNfrKey: nfr.externalKey || '',
      impact: 'medium',
      probability: 'medium',
    });
  }

  assumptions.slice(0, 15).forEach((a, idx) => {
    const text = typeof a === 'string' ? a : a?.text || a?.assumption || '';
    if (!text) return;
    const externalKey = `RISK-ASM-${idx + 1}`.slice(0, 64);
    if (existingKeys.has(`RISK:${externalKey}`)) return;
    byKind.RISK.push({
      externalKey,
      title: `Assumption risk: ${String(text).slice(0, 80)}`.slice(0, 240),
      summary: String(text).slice(0, 2000),
      impact: 'medium',
      probability: 'low',
      mitigation: '',
    });
  });

  const resourceRoles = defaultResourceRolesSample();

  return { byKind, resourceRoles };
}

function splitSkillKeys(raw) {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item || '').trim()).filter(Boolean);
  }
  return String(raw || '')
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function roleForResourceStructured(role) {
  const count = Number(role?.count);
  const effortHours = Number(role?.effortHours);
  return {
    roleKey: String(role?.roleKey || '').trim(),
    title: String(role?.title || '').trim(),
    count: Number.isFinite(count) ? count : 1,
    skillKeys: splitSkillKeys(role?.skillKeys),
    effortHours: Number.isFinite(effortHours) ? effortHours : 0,
    notes: String(role?.notes || ''),
  };
}

/**
 * Flat seed maps → PlanningArtifact create payloads.
 * RESOURCE_ROLES is not a kind: roles land on RES-PLAN.structured.roles.
 * @param {{ byKind?: Record<string, object[]>, resourceRoles?: object[] }} seed
 * @param {Set<string>|string[]} existingKeys kind:externalKey already stored
 */
function draftRowsFromRaSeed(seed = {}, existingKeys) {
  const byKind = seed.byKind && typeof seed.byKind === 'object' ? seed.byKind : {};
  const skip =
    existingKeys instanceof Set
      ? existingKeys
      : new Set(Array.isArray(existingKeys) ? existingKeys : []);
  const rolesByResource = new Map();
  for (const role of Array.isArray(seed.resourceRoles) ? seed.resourceRoles : []) {
    const resourceKey = String(role?.resourceExternalKey || '').trim();
    if (!resourceKey) continue;
    if (!rolesByResource.has(resourceKey)) rolesByResource.set(resourceKey, []);
    rolesByResource.get(resourceKey).push(roleForResourceStructured(role));
  }

  const rows = [];
  for (const [kind, list] of Object.entries(byKind)) {
    if (kind === 'RESOURCE_ROLES') continue;
    if (!Array.isArray(list)) continue;
    const cols = SHEET_COLUMNS[kind] || [];
    for (const raw of list) {
      const externalKey = String(raw?.externalKey || '').trim();
      if (!externalKey || skip.has(`${kind}:${externalKey}`)) continue;
      const structured = {};
      let parentExternalKey = '';
      let body = '';
      for (const col of cols) {
        if (col.key === 'externalKey' || col.key === 'title' || col.key === 'summary') continue;
        if (col.topLevel && col.key === 'body') {
          body = raw.body == null ? '' : String(raw.body);
          continue;
        }
        if (col.key === 'parentExternalKey') {
          parentExternalKey = raw.parentExternalKey == null ? '' : String(raw.parentExternalKey);
          continue;
        }
        if (col.structured) {
          structured[col.key] = raw[col.key] == null ? '' : raw[col.key];
        }
      }
      if (kind === 'RESOURCE') {
        structured.roles = rolesByResource.get(externalKey) || [];
      }
      rows.push({
        kind,
        externalKey,
        title: String(raw.title || '').trim(),
        summary: raw.summary == null ? '' : String(raw.summary),
        parentExternalKey,
        ...(body ? { body } : {}),
        structured,
      });
    }
  }
  return rows;
}

module.exports = {
  buildPlanningWorkbookBuffer,
  buildSeedMapsFromRa,
  draftRowsFromRaSeed,
};
