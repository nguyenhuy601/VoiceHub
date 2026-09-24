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
        'Fill kind sheets; RESOURCE_ROLES links roles to RESOURCE.externalKey. Import on Duyệt & baseline (dryRun preview first).',
    },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(metaRows), META_SHEET);

  for (const kind of PLANNING_ARTIFACT_KINDS) {
    const cols = SHEET_COLUMNS[kind];
    const headers = cols.map((c) => c.key);
    let dataRows = Array.isArray(byKind[kind]) ? byKind[kind] : [];
    if (!dataRows.length) {
      dataRows = [defaultSampleRow(kind)];
    }
    const sheetRows = dataRows.map((r) => rowToSheetObject(kind, { ...defaultSampleRow(kind), ...r }));
    const aoa = [headers, ...sheetRows.map((r) => headers.map((h) => r[h] ?? ''))];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), kind);
  }

  const roleHeaders = RESOURCE_ROLES_COLUMNS.map((c) => c.key);
  let roleRows = Array.isArray(seed.resourceRoles) ? seed.resourceRoles : [];
  if (!roleRows.length) {
    roleRows = defaultResourceRolesSample();
  }
  const roleAoa = [
    roleHeaders,
    ...roleRows.map((r) => roleHeaders.map((h) => cell(r[h]))),
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

module.exports = {
  buildPlanningWorkbookBuffer,
  buildSeedMapsFromRa,
};
