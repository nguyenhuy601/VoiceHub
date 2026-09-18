/**
 * Phase 1 AnalysisArtifact list columns by kind (subset of Requirement Analysis Excel sheets).
 */

const CELL_TRUNCATE = 100;

function structured(row) {
  return row?.structured && typeof row.structured === 'object' ? row.structured : {};
}

function asText(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return String(value).trim();
}

/**
 * Truncate for table display; full text via title attribute in UI.
 * @param {string} text
 * @param {number} [max]
 */
export function truncateCell(text, max = CELL_TRUNCATE) {
  const s = asText(text);
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function col(id, labelKey, getValue, options = {}) {
  return {
    id,
    labelKey,
    getValue,
    mono: Boolean(options.mono),
    isStatus: id === 'status',
  };
}

const COL_ID = col('id', 'workspace.phase1ColKey', (row) => asText(row?.externalKey), { mono: true });
const COL_TITLE = col('title', 'workspace.phase1ColTitle', (row) => asText(row?.title));
const COL_STATUS = col('status', 'workspace.phase1ColStatus', (row) => asText(row?.status));
const COL_SOURCE = col('source', 'workspace.phase1ColSource', (row) => asText(row?.source));
const COL_IMPORT_SET = col('importSet', 'workspace.phase1ColImportSet', (row) =>
  asText(row?.importSetId).slice(0, 12)
);
const COL_PRIORITY = col('priority', 'workspace.phase1ColPriority', (row) =>
  asText(structured(row).priority)
);
const COL_STATEMENT = col('statement', 'workspace.phase1ColStatement', (row) =>
  asText(structured(row).statement || structured(row).goal || row?.summary)
);
const COL_SUCCESS_METRIC = col('successMetric', 'workspace.phase1ColSuccessMetric', (row) =>
  asText(structured(row).successMetric)
);
const COL_DESCRIPTION = col('description', 'workspace.phase1ColDescription', (row) =>
  asText(structured(row).description || structured(row).statement || row?.summary)
);
const COL_WHEN_APPLIES = col('whenApplies', 'workspace.phase1ColWhenApplies', (row) =>
  asText(structured(row).whenApplies)
);
const COL_EXCEPTION = col('exception', 'workspace.phase1ColException', (row) =>
  asText(structured(row).exception)
);
const COL_RELATED_BG = col('relatedBg', 'workspace.phase1ColRelatedBg', (row) =>
  asText(structured(row).relatedBgKey)
);
const COL_PROCESS_NAME = col('processName', 'workspace.phase1ColProcessName', (row) =>
  asText(structured(row).processName || row?.title)
);
const COL_STEP = col('step', 'workspace.phase1ColStep', (row) => asText(structured(row).step));
const COL_ACTOR = col('actor', 'workspace.phase1ColActor', (row) =>
  asText(structured(row).actor || structured(row).actors)
);
const COL_ACTION = col('action', 'workspace.phase1ColAction', (row) => asText(structured(row).action));
const COL_RELATED_SYSTEMS = col('relatedSystems', 'workspace.phase1ColRelatedSystems', (row) =>
  asText(structured(row).relatedSystems)
);
const COL_LEVEL = col('level', 'workspace.phase1ColLevel', (row) => asText(structured(row).level));
const COL_ARTIFACT = col('artifact', 'workspace.phase1ColArtifact', (row) => asText(row?.title));
const COL_REQUIREMENT = col('requirement', 'workspace.phase1ColRequirement', (row) =>
  asText(row?.title)
);
const COL_PRECONDITION = col('precondition', 'workspace.phase1ColPrecondition', (row) =>
  asText(structured(row).precondition)
);
const COL_RELATED_FR = col('relatedFr', 'workspace.phase1ColRelatedFr', (row) =>
  asText(structured(row).relatedFrKeys)
);
const COL_CATEGORY = col('category', 'workspace.phase1ColCategory', (row) =>
  asText(structured(row).category)
);
const COL_TARGET = col('target', 'workspace.phase1ColTarget', (row) =>
  asText(structured(row).target || structured(row).metric || structured(row).measurement)
);
const COL_SCOPE_TYPE = col('scopeType', 'workspace.phase1ColScopeType', (row) =>
  asText(structured(row).scopeType)
);
const COL_SCOPE_DESCRIPTION = col('scopeDescription', 'workspace.phase1ColDescription', (row) =>
  asText(row?.title || structured(row).description)
);

const COLUMNS_BY_KIND = Object.freeze({
  BG: [
    COL_ID,
    COL_TITLE,
    COL_STATEMENT,
    COL_SUCCESS_METRIC,
    COL_PRIORITY,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  BR: [
    COL_ID,
    COL_TITLE,
    COL_DESCRIPTION,
    COL_WHEN_APPLIES,
    COL_EXCEPTION,
    COL_RELATED_BG,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  BPM: [
    COL_ID,
    COL_PROCESS_NAME,
    COL_STEP,
    COL_ACTOR,
    COL_ACTION,
    COL_RELATED_SYSTEMS,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  FR: [
    COL_ID,
    COL_LEVEL,
    COL_ARTIFACT,
    COL_PRIORITY,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  UC: [
    COL_ID,
    COL_TITLE,
    COL_ACTOR,
    COL_PRECONDITION,
    COL_RELATED_FR,
    COL_PRIORITY,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  NFR: [
    COL_ID,
    COL_CATEGORY,
    COL_REQUIREMENT,
    COL_TARGET,
    COL_PRIORITY,
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  SCOPE: [COL_ID, COL_SCOPE_TYPE, COL_SCOPE_DESCRIPTION, COL_SOURCE, COL_IMPORT_SET, COL_STATUS],
});

const DEFAULT_COLUMNS = Object.freeze([
  COL_ID,
  COL_TITLE,
  COL_SOURCE,
  COL_IMPORT_SET,
  COL_STATUS,
]);

/**
 * @param {string} kind
 * @returns {ReadonlyArray<{ id: string, labelKey: string, getValue: (row: object) => string, mono?: boolean, isStatus?: boolean }>}
 */
export function getArtifactListColumns(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return COLUMNS_BY_KIND[k] || DEFAULT_COLUMNS;
}

export { COLUMNS_BY_KIND, DEFAULT_COLUMNS, CELL_TRUNCATE };
