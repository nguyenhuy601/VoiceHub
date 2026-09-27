/**
 * Planning workbook header aliases — Scrum/ClickUp display names ↔ internal keys.
 * Import accepts both legacy camelCase and display headers (case-insensitive).
 */

/** Canonical internal key → preferred Excel/UI header (Scrum-friendly). */
const DISPLAY_HEADER_BY_KEY = Object.freeze({
  externalKey: 'Key',
  parentExternalKey: 'Parent Key',
  title: 'Title',
  summary: 'Description',
  startDate: 'Start Date',
  endDate: 'Due Date',
  effortHours: 'Estimate Hours',
  assigneeEmail: 'Assignee Email',
  assigneeName: 'Assignee Name',
  sourceFrKey: 'Source FR Key',
  skillKeys: 'Skills',
  body: 'Body',
  techStack: 'Tech Stack',
  diagramRef: 'Diagram Ref',
  fromKey: 'From Key',
  toKey: 'To Key',
  dependencyType: 'Dependency Type',
  lagDays: 'Lag Days',
  phaseKey: 'Phase Key',
  targetDate: 'Target Date',
  targetPhase: 'Target Phase',
  impact: 'Impact',
  probability: 'Probability',
  sourceNfrKey: 'Source NFR Key',
  mitigation: 'Mitigation',
  resourceExternalKey: 'Resource Key',
  roleKey: 'Role Key',
  count: 'Count',
  notes: 'Notes',
});

/**
 * Any accepted header (normalized) → internal key.
 * Includes identity maps for camelCase keys.
 */
const HEADER_ALIAS_TO_KEY = (() => {
  const map = new Map();
  const add = (header, key) => {
    const n = normalizeHeaderToken(header);
    if (n) map.set(n, key);
  };
  for (const [key, display] of Object.entries(DISPLAY_HEADER_BY_KEY)) {
    add(key, key);
    add(display, key);
  }
  // Extra aliases (Scrum / Jira / ClickUp habits)
  add('Parent Key', 'parentExternalKey');
  add('Parent', 'parentExternalKey');
  add('parent_key', 'parentExternalKey');
  add('Issue Key', 'externalKey');
  add('Work Item Key', 'externalKey');
  add('ID', 'externalKey');
  add('name', 'title');
  add('Name', 'title');
  add('summary', 'summary');
  add('Description', 'summary');
  add('Desc', 'summary');
  add('Due Date', 'endDate');
  add('End Date', 'endDate');
  add('Estimate', 'effortHours');
  add('Estimate (Hours)', 'effortHours');
  add('Hours', 'effortHours');
  add('Assignee', 'assigneeEmail');
  add('Resource External Key', 'resourceExternalKey');
  // WBS Role Key uses the same header as RESOURCE_ROLES.roleKey.
  add('Role', 'roleKey');
  return map;
})();

/** Suffix on exported headers the import may suggest. Stripped before key lookup. */
const SUGGESTION_HEADER_MARK = '(Gợi ý)';

function stripSuggestionMark(header) {
  return String(header || '')
    .replace(/\s*\(gợi ý\)\s*$/i, '')
    .replace(/\s*\(suggested\)\s*$/i, '')
    .trim();
}

function normalizeHeaderToken(raw) {
  return stripSuggestionMark(raw).replace(/\s+/g, ' ').toLowerCase();
}

function displayHeaderForKey(key) {
  const k = String(key || '').trim();
  return DISPLAY_HEADER_BY_KEY[k] || k;
}

/**
 * Resolve one Excel header cell → internal catalog key (or null).
 */
function resolveInternalKeyFromHeader(header) {
  const n = normalizeHeaderToken(header);
  if (!n) return null;
  if (HEADER_ALIAS_TO_KEY.has(n)) return HEADER_ALIAS_TO_KEY.get(n);
  // camelCase passthrough if already a known key
  const raw = String(header || '').trim();
  if (DISPLAY_HEADER_BY_KEY[raw]) return raw;
  return null;
}

/**
 * Remap sheet_to_json row keys (Excel headers) → internal keys.
 * First matching alias wins; unknown columns kept as-is (ignored by mapper).
 */
function remapRowHeadersToInternalKeys(item = {}) {
  const out = {};
  for (const [header, value] of Object.entries(item || {})) {
    const key = resolveInternalKeyFromHeader(header) || header;
    if (out[key] === undefined || out[key] === '' || out[key] === null) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Headers to write when exporting a kind sheet (display order = catalog keys).
 */
function exportHeadersForColumns(columns = []) {
  return (Array.isArray(columns) ? columns : []).map((c) => displayHeaderForKey(c.key));
}

module.exports = {
  DISPLAY_HEADER_BY_KEY,
  normalizeHeaderToken,
  displayHeaderForKey,
  resolveInternalKeyFromHeader,
  remapRowHeadersToInternalKeys,
  exportHeadersForColumns,
};
