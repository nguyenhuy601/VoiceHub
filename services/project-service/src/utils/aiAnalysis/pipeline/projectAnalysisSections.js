/**
 * Analysis-sheet projectors for snapshot.projected.srs (Data Lineage P0).
 * Keys align with packRowsForEngine / analysis-freeze pack.
 */

const { createHash } = require('node:crypto');

/** Section keys that must exist on projected.srs (arrays may be empty). */
const REQUIRED_PROJECTED_SRS_SECTIONS = Object.freeze([
  'functionalRequirements',
  'nonFunctionalRequirements',
  'businessGoals',
  'businessRules',
  'scope',
  'businessProcesses',
  'interfaces',
  'useCases',
  'entities',
  'glossary',
  'assumptions',
]);

const SECTION_CAPS = Object.freeze({
  functionalRequirements: 500,
  nonFunctionalRequirements: 100,
  businessGoals: 200,
  businessRules: 200,
  scope: 200,
  businessProcesses: 200,
  interfaces: 200,
  useCases: 200,
  entities: 200,
  glossary: 300,
  assumptions: 200,
});

const PACK_SOURCE_BY_SECTION = Object.freeze({
  functionalRequirements: 'functionalRequirements',
  nonFunctionalRequirements: 'nonFunctionalRequirements',
  businessGoals: 'businessGoals',
  businessRules: 'businessRules',
  scope: 'scope',
  businessProcesses: 'businessProcesses',
  interfaces: 'interfaces',
  useCases: 'useCases',
  entities: 'dataEntities',
  glossary: 'glossary',
  assumptions: 'assumptions',
});

const DEFAULT_SHEET_BY_SECTION = Object.freeze({
  functionalRequirements: '03_Functional_Requirements',
  nonFunctionalRequirements: '04_Non_Functional_Requirements',
  businessGoals: '05_Business_Goals',
  businessRules: '06_Business_Rules',
  scope: '08_Scope',
  businessProcesses: '07_Business_Processes',
  interfaces: '10_Interfaces',
  useCases: '09_Use_Cases',
  entities: '11_Data_Entities',
  glossary: '13_Glossary',
  assumptions: '12_Assumptions',
});

function stableContentHash(parts) {
  const raw = parts
    .map((p) => String(p == null ? '' : p).trim())
    .filter(Boolean)
    .join('\n');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

/**
 * @param {object} row
 * @param {{ section: string, index: number }} ctx
 */
function attachSourceIdentity(row, { section, index }) {
  const externalId = String(
    row?.externalId || row?.id || row?.stableId || `${section}-${index + 1}`
  ).trim();
  const sourceSheet = String(
    row?.sourceSheet || row?.sheet || DEFAULT_SHEET_BY_SECTION[section] || section
  ).trim();
  const sourceRowId =
    row?.sourceRowId != null
      ? String(row.sourceRowId)
      : row?.rowId != null
        ? String(row.rowId)
        : row?.__rowNum != null
          ? String(row.__rowNum)
          : String(index + 1);
  const contentHash =
    String(row?.contentHash || '').trim() ||
    stableContentHash([
      externalId,
      section,
      sourceSheet,
      sourceRowId,
      row?.name,
      row?.title,
      row?.description,
      row?.requirement,
      row?.text,
      row?.assumption,
      row?.goal,
      row?.rule,
      row?.processName,
      row?.term,
      row?.definition,
    ]);

  return {
    externalId,
    stableId: String(row?.stableId || externalId).trim(),
    section,
    sourceSheet,
    sourceRowId,
    contentHash,
  };
}

function projectGenericAnalysisRow(row, { section, index }, textFields = []) {
  if (!row || typeof row !== 'object') return null;
  const identity = attachSourceIdentity(row, { section, index });
  const out = { ...identity };
  for (const key of textFields) {
    if (row[key] == null) continue;
    const v = row[key];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out[key] = t.slice(0, 4000);
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[key] = v;
    } else if (Array.isArray(v)) {
      out[key] = v.slice(0, 40).map((x) => (typeof x === 'string' ? x : String(x)));
    }
  }
  return out;
}

const SECTION_TEXT_FIELDS = Object.freeze({
  businessGoals: ['name', 'title', 'goal', 'description', 'priority', 'metric', 'status', 'baNote'],
  businessRules: ['name', 'title', 'rule', 'description', 'priority', 'status', 'baNote'],
  scope: ['type', 'description', 'source', 'status', 'baNote'],
  businessProcesses: [
    'name',
    'title',
    'processName',
    'description',
    'actor',
    'trigger',
    'status',
    'baNote',
  ],
  interfaces: ['name', 'title', 'system', 'description', 'direction', 'protocol', 'status'],
  useCases: [
    'name',
    'title',
    'description',
    'actor',
    'precondition',
    'mainFlow',
    'priority',
    'status',
    'baNote',
  ],
  entities: ['name', 'title', 'description', 'attributes', 'relations', 'status'],
  glossary: ['term', 'name', 'definition', 'description', 'aliases'],
  assumptions: ['assumption', 'text', 'description', 'impactIfInvalid', 'status', 'baNote'],
});

/**
 * Project one analysis section array from pack.
 * @param {object} pack
 * @param {string} section — key in REQUIRED_PROJECTED_SRS_SECTIONS
 */
function projectAnalysisSection(pack, section) {
  const packKey = PACK_SOURCE_BY_SECTION[section];
  if (!packKey) return [];
  const rows = Array.isArray(pack?.[packKey]) ? pack[packKey] : [];
  const cap = SECTION_CAPS[section] || 200;
  const fields = SECTION_TEXT_FIELDS[section] || ['name', 'description', 'text'];
  const out = [];
  for (let i = 0; i < rows.length && out.length < cap; i += 1) {
    const projected = projectGenericAnalysisRow(rows[i], { section, index: i }, fields);
    if (projected) out.push(projected);
  }
  return out;
}

/**
 * @param {object} pack
 * @returns {Record<string, object[]>}
 */
function projectAllAnalysisSections(pack) {
  const srsExtra = {};
  for (const section of REQUIRED_PROJECTED_SRS_SECTIONS) {
    if (section === 'functionalRequirements' || section === 'nonFunctionalRequirements') {
      continue;
    }
    srsExtra[section] = projectAnalysisSection(pack, section);
  }
  return srsExtra;
}

/**
 * @param {object|null|undefined} srs
 * @returns {boolean}
 */
function hasRequiredProjectedSrsSections(srs) {
  if (!srs || typeof srs !== 'object') return false;
  for (const key of REQUIRED_PROJECTED_SRS_SECTIONS) {
    if (!Object.prototype.hasOwnProperty.call(srs, key)) return false;
    if (!Array.isArray(srs[key])) return false;
  }
  return true;
}

module.exports = {
  REQUIRED_PROJECTED_SRS_SECTIONS,
  SECTION_CAPS,
  PACK_SOURCE_BY_SECTION,
  attachSourceIdentity,
  projectAnalysisSection,
  projectAllAnalysisSections,
  hasRequiredProjectedSrsSections,
  stableContentHash,
};
