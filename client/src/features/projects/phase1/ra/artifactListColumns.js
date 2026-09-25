/**
 * Phase 1 AnalysisArtifact list columns by kind (aligned with Requirement Analysis Excel).
 * Default = curated “meaningful” set; full catalog available via Column picker (DEC R1).
 */

const CELL_TRUNCATE = 100;
/** v3 — Excel-full defaults (BR/BPM IDs, Related CR, …); bump clears stale picker prefs. */
const PREFS_PREFIX = 'vh.phase1.listCols.v3.';

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

/**
 * @param {string} id
 * @param {string} labelKey
 * @param {(row: object) => string} getValue
 * @param {{ mono?: boolean, defaultVisible?: boolean }} [options]
 */
function col(id, labelKey, getValue, options = {}) {
  return {
    id,
    labelKey,
    getValue,
    mono: Boolean(options.mono),
    isStatus: id === 'status',
    defaultVisible: options.defaultVisible !== false,
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
const COL_BUSINESS_PROBLEM = col(
  'businessProblem',
  'workspace.phase1FieldBusinessProblem',
  (row) => asText(structured(row).businessProblem),
  { defaultVisible: false }
);
const COL_EXPECTED_OUTCOME = col(
  'expectedOutcome',
  'workspace.phase1FieldExpectedOutcome',
  (row) => asText(structured(row).expectedBusinessOutcome),
  { defaultVisible: false }
);
const COL_ASSUMPTION = col(
  'assumption',
  'workspace.phase1FieldAssumption',
  (row) => asText(structured(row).assumption || structured(row).assumptions),
  { defaultVisible: false }
);
const COL_DESCRIPTION = col('description', 'workspace.phase1ColDescription', (row) =>
  asText(structured(row).description || structured(row).statement || row?.summary)
);
const COL_WHEN_APPLIES = col('whenApplies', 'workspace.phase1ColWhenApplies', (row) =>
  asText(structured(row).whenApplies)
);
const COL_EXCEPTION = col('exception', 'workspace.phase1ColException', (row) =>
  asText(structured(row).exception || structured(row).exceptionFlow)
);
const COL_RELATED_BG = col('relatedBg', 'workspace.phase1ColRelatedBg', (row) =>
  asText(structured(row).relatedBgKey)
);
const COL_BUSINESS_RULE = col(
  'businessRule',
  'workspace.phase1FieldBusinessRules',
  (row) => asText(structured(row).businessRule || structured(row).businessRules),
  { defaultVisible: false }
);
const COL_DEPENDENCY = col(
  'dependency',
  'workspace.phase1FieldDependency',
  (row) => asText(structured(row).dependency),
  { defaultVisible: false }
);
const COL_PROCESS_NAME = col('processName', 'workspace.phase1ColProcessName', (row) =>
  asText(structured(row).processName || row?.title)
);
const COL_STEP = col('step', 'workspace.phase1ColStep', (row) => asText(structured(row).step));
const COL_ACTOR = col('actor', 'workspace.phase1ColActor', (row) =>
  asText(structured(row).actor || structured(row).actors)
);
const COL_SECONDARY_ACTOR = col(
  'secondaryActor',
  'workspace.phase1FieldSecondaryActor',
  (row) => asText(structured(row).secondaryActor),
  { defaultVisible: false }
);
const COL_ACTION = col('action', 'workspace.phase1ColAction', (row) => asText(structured(row).action));
const COL_RELATED_SYSTEMS = col('relatedSystems', 'workspace.phase1ColRelatedSystems', (row) =>
  asText(structured(row).relatedSystems)
);
const COL_TRIGGER = col(
  'trigger',
  'workspace.phase1FieldTrigger',
  (row) => asText(structured(row).trigger),
  { defaultVisible: false }
);
const COL_INPUT = col(
  'input',
  'workspace.phase1FieldInput',
  (row) => asText(structured(row).input),
  { defaultVisible: false }
);
const COL_OUTPUT = col(
  'output',
  'workspace.phase1FieldOutput',
  (row) => asText(structured(row).output),
  { defaultVisible: false }
);
const COL_LEVEL = col('level', 'workspace.phase1ColLevel', (row) => asText(structured(row).level));
const COL_MODULE = col('module', 'workspace.phase1ColModule', (row) =>
  asText(structured(row).moduleLabel || structured(row).module)
);
const COL_CAPABILITY = col(
  'capability',
  'workspace.phase1FieldCapability',
  (row) => asText(structured(row).capabilityLabel || structured(row).capability),
  { defaultVisible: false }
);
const COL_FEATURE = col('feature', 'workspace.phase1ColFeature', (row) =>
  asText(structured(row).featureLabel || structured(row).feature)
);
const COL_ARTIFACT = col('artifact', 'workspace.phase1ColArtifact', (row) => asText(row?.title));
const COL_REQUIREMENT = col('requirement', 'workspace.phase1ColRequirement', (row) =>
  asText(structured(row).requirement || row?.title)
);
const COL_PARENT = col(
  'parent',
  'workspace.phase1FieldParentKey',
  (row) => asText(structured(row).parentExternalKey),
  { defaultVisible: false, mono: true }
);
const COL_PRECONDITION = col('precondition', 'workspace.phase1ColPrecondition', (row) =>
  asText(structured(row).precondition || structured(row).preconditions)
);
const COL_POSTCONDITION = col(
  'postcondition',
  'workspace.phase1FieldPostconditions',
  (row) => asText(structured(row).postconditions || structured(row).postcondition),
  { defaultVisible: false }
);
const COL_MAIN_BEHAVIOR = col('mainBehavior', 'workspace.phase1FieldMainFlow', (row) =>
  asText(structured(row).mainBehavior || structured(row).mainFlow || structured(row).basicFlow)
);
const COL_ALT_FLOW = col(
  'alternativeFlow',
  'workspace.phase1FieldAlternativeFlow',
  (row) => asText(structured(row).alternativeFlow),
  { defaultVisible: false }
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
const COL_CUSTOMER_REQ_IDS = col(
  'customerRequirementIds',
  'workspace.phase1FieldCrIds',
  (row) => asText(structured(row).customerRequirementIds)
);
const COL_DATE_RAISED = col('dateRaised', 'workspace.phase1ColDateRaised', (row) =>
  asText(structured(row).dateRaised)
);
/** Excel "Source" column (khác provenance row.source = seed_from_pack / manual). */
const COL_WORKBOOK_SOURCE = col('workbookSource', 'workspace.phase1ColWorkbookSource', (row) =>
  asText(structured(row).source)
);
/** Excel workbook Status (Draft|Reviewed|Approved) — khác lifecycle artifact.status. */
const COL_ANALYSIS_STATUS = col('analysisStatus', 'workspace.phase1ColAnalysisStatus', (row) =>
  asText(structured(row).status)
);
const COL_RELATED_ARTIFACT_IDS = col(
  'relatedArtifactIds',
  'workspace.phase1FieldRelatedArtifacts',
  (row) => asText(structured(row).relatedArtifactIds)
);
const COL_BR_IDS = col('brIds', 'workspace.phase1FieldBrIds', (row) =>
  asText(structured(row).brIds)
);
const COL_BPM_IDS = col('bpmIds', 'workspace.phase1FieldBpmIds', (row) =>
  asText(structured(row).bpmIds)
);
const COL_RELATED_BR = col('relatedBr', 'workspace.phase1FieldRelatedBr', (row) =>
  asText(structured(row).relatedBrKey || structured(row).relatedBr)
);
const COL_RELATED_CR = col('relatedCr', 'workspace.phase1FieldRelatedCr', (row) =>
  asText(structured(row).relatedCr)
);
const COL_PROCESS_DESCRIPTION = col(
  'processDescription',
  'workspace.phase1FieldProcessDescription',
  (row) => asText(structured(row).processDescription)
);
const COL_SUCCESS_CRITERIA = col(
  'successCriteria',
  'workspace.phase1FieldSuccessCriteria',
  (row) => asText(structured(row).successCriteria || structured(row).successMetric)
);
const COL_NFR_SCOPE = col('nfrScope', 'workspace.phase1FieldNfrScope', (row) =>
  asText(structured(row).scope)
);

/** Force Excel-primary columns visible even when base col defaults hidden. */
const vis = (c) => ({ ...c, defaultVisible: true });

const COL_ACCEPTANCE = col('acceptance', 'workspace.phase1ColAcceptance', (row) =>
  asText(structured(row).acceptanceCriteria || structured(row).acceptance)
);
const COL_STAKEHOLDER = col('stakeholder', 'workspace.phase1ColStakeholder', (row) =>
  asText(structured(row).stakeholder || structured(row).stakeholders)
);
const COL_GOAL = col('goal', 'workspace.phase1ColGoal', (row) =>
  asText(structured(row).goal || structured(row).statement)
);
const COL_MAIN_FLOW = col('mainFlow', 'workspace.phase1ColMainFlow', (row) =>
  asText(structured(row).mainFlow || structured(row).basicFlow)
);
const COL_MEASUREMENT = col('measurement', 'workspace.phase1ColMeasurement', (row) =>
  asText(structured(row).measurement || structured(row).metric)
);
const COL_CONSTRAINT = col('constraint', 'workspace.phase1ColConstraint', (row) =>
  asText(structured(row).constraint || structured(row).constraints)
);
const COL_BA_NOTE = col(
  'baNote',
  'workspace.phase1ColBaNote',
  (row) => asText(structured(row).baNote || structured(row).note),
  { defaultVisible: false }
);
const COL_INTERFACE_NAME = col('interfaceName', 'workspace.phase1ColInterfaceName', (row) =>
  asText(structured(row).interfaceName || row.title)
);
const COL_INTERFACE_TYPE = col('interfaceType', 'workspace.phase1ColInterfaceType', (row) =>
  asText(structured(row).interfaceType)
);
const COL_DIRECTION = col('direction', 'workspace.phase1ColDirection', (row) =>
  asText(structured(row).direction)
);
const COL_PROTOCOL = col('protocol', 'workspace.phase1ColProtocol', (row) =>
  asText(structured(row).protocol)
);
const COL_ENTITY = col('entity', 'workspace.phase1ColEntity', (row) =>
  asText(structured(row).entity || row.title)
);
const COL_ATTRIBUTES = col('attributes', 'workspace.phase1ColAttributes', (row) =>
  asText(structured(row).attributes)
);
const COL_VALIDATION_RULES = col('validationRules', 'workspace.phase1ColValidationRules', (row) =>
  asText(structured(row).validationRules || structured(row).rules)
);
const COL_TERM = col('term', 'workspace.phase1ColTerm', (row) =>
  asText(structured(row).term || row.title)
);
const COL_DEFINITION = col('definition', 'workspace.phase1ColDefinition', (row) =>
  asText(structured(row).definition || row.summary)
);
const COL_ASSUMPTION_TEXT = col('assumptionText', 'workspace.phase1ColAssumptionText', (row) =>
  asText(structured(row).text || row.title || row.summary)
);
const COL_IMPACT_IF_INVALID = col('impactIfInvalid', 'workspace.phase1ColImpactIfInvalid', (row) =>
  asText(structured(row).impactIfInvalid)
);
const COL_VERIFICATION = col(
  'verification',
  'workspace.phase1FieldVerification',
  (row) => asText(structured(row).verification),
  { defaultVisible: false }
);

/** Full catalog per kind — default = đủ cột Excel phân tích/truy vết. */
const COLUMNS_BY_KIND = Object.freeze({
  BG: [
    COL_ID,
    COL_CUSTOMER_REQ_IDS,
    COL_STATEMENT,
    vis(COL_BUSINESS_PROBLEM),
    vis(COL_EXPECTED_OUTCOME),
    COL_SUCCESS_METRIC,
    COL_PRIORITY,
    COL_STAKEHOLDER,
    vis(COL_ASSUMPTION),
    COL_CONSTRAINT,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  BR: [
    COL_ID,
    COL_RELATED_BG,
    COL_CUSTOMER_REQ_IDS,
    COL_DESCRIPTION,
    vis(COL_BUSINESS_RULE),
    COL_STAKEHOLDER,
    COL_PRIORITY,
    COL_SUCCESS_CRITERIA,
    vis(COL_DEPENDENCY),
    vis(COL_ASSUMPTION),
    COL_CONSTRAINT,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  BPM: [
    COL_ID,
    COL_RELATED_BR,
    COL_PROCESS_NAME,
    COL_PROCESS_DESCRIPTION,
    vis(COL_TRIGGER),
    COL_ACTOR,
    vis(COL_PRECONDITION),
    COL_STEP,
    COL_ACTION,
    vis(COL_INPUT),
    vis(COL_OUTPUT),
    vis(COL_BUSINESS_RULE),
    vis(COL_EXCEPTION),
    COL_RELATED_CR,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  FR: [
    COL_ID,
    vis(COL_PARENT),
    COL_LEVEL,
    COL_MODULE,
    vis(COL_CAPABILITY),
    COL_FEATURE,
    COL_ARTIFACT,
    COL_CUSTOMER_REQ_IDS,
    COL_BR_IDS,
    COL_BPM_IDS,
    COL_ACTOR,
    vis(COL_TRIGGER),
    vis(COL_PRECONDITION),
    COL_MAIN_BEHAVIOR,
    vis(COL_BUSINESS_RULE),
    vis(COL_INPUT),
    vis(COL_OUTPUT),
    vis(COL_EXCEPTION),
    COL_ACCEPTANCE,
    COL_PRIORITY,
    vis(COL_DEPENDENCY),
    vis(COL_ASSUMPTION),
    vis(COL_CONSTRAINT),
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  UC: [
    COL_ID,
    COL_RELATED_FR,
    COL_BR_IDS,
    COL_CUSTOMER_REQ_IDS,
    COL_TITLE,
    COL_GOAL,
    COL_ACTOR,
    vis(COL_SECONDARY_ACTOR),
    vis(COL_TRIGGER),
    COL_PRECONDITION,
    vis(COL_POSTCONDITION),
    COL_MAIN_FLOW,
    vis(COL_ALT_FLOW),
    vis(COL_EXCEPTION),
    vis(COL_BUSINESS_RULE),
    vis(COL_INPUT),
    vis(COL_OUTPUT),
    COL_PRIORITY,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  NFR: [
    COL_ID,
    COL_CUSTOMER_REQ_IDS,
    COL_CATEGORY,
    COL_REQUIREMENT,
    COL_TARGET,
    COL_MEASUREMENT,
    COL_PRIORITY,
    COL_NFR_SCOPE,
    COL_CONSTRAINT,
    vis(COL_ACCEPTANCE),
    COL_WORKBOOK_SOURCE,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  SCOPE: [
    COL_ID,
    COL_SCOPE_TYPE,
    COL_SCOPE_DESCRIPTION,
    COL_CUSTOMER_REQ_IDS,
    COL_WORKBOOK_SOURCE,
    COL_DATE_RAISED,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  INTERFACE: [
    COL_ID,
    COL_INTERFACE_NAME,
    COL_INTERFACE_TYPE,
    COL_DIRECTION,
    COL_PROTOCOL,
    COL_DESCRIPTION,
    COL_RELATED_ARTIFACT_IDS,
    COL_CUSTOMER_REQ_IDS,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  DATA: [
    COL_ID,
    COL_ENTITY,
    COL_ATTRIBUTES,
    COL_VALIDATION_RULES,
    COL_RELATED_ARTIFACT_IDS,
    COL_CUSTOMER_REQ_IDS,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  GLOSSARY: [
    COL_ID,
    COL_TERM,
    COL_DEFINITION,
    COL_RELATED_ARTIFACT_IDS,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
  ASSUMPTION: [
    COL_ID,
    COL_ASSUMPTION_TEXT,
    COL_IMPACT_IF_INVALID,
    COL_RELATED_ARTIFACT_IDS,
    COL_CUSTOMER_REQ_IDS,
    COL_ANALYSIS_STATUS,
    vis(COL_BA_NOTE),
    COL_SOURCE,
    COL_IMPORT_SET,
    COL_STATUS,
  ],
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
 * @returns {ReadonlyArray<object>}
 */
export function getArtifactListColumnCatalog(kind) {
  const k = String(kind || '')
    .trim()
    .toUpperCase();
  return COLUMNS_BY_KIND[k] || DEFAULT_COLUMNS;
}

/**
 * @param {string} kind
 * @returns {string[]}
 */
export function getDefaultVisibleColumnIds(kind) {
  return getArtifactListColumnCatalog(kind)
    .filter((c) => c.defaultVisible !== false)
    .map((c) => c.id);
}

/**
 * @param {string} kind
 * @returns {string}
 */
export function columnPrefsStorageKey(kind) {
  return `${PREFS_PREFIX}${String(kind || '')
    .trim()
    .toUpperCase()}`;
}

/**
 * @param {string} kind
 * @returns {string[] | null}
 */
export function loadVisibleColumnIds(kind) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(columnPrefsStorageKey(kind));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((id) => String(id)).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * @param {string} kind
 * @param {string[]} ids
 */
export function saveVisibleColumnIds(kind, ids) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(columnPrefsStorageKey(kind), JSON.stringify(ids));
  } catch {
    /* ignore quota */
  }
}

/**
 * @param {string} kind
 */
export function clearVisibleColumnIds(kind) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(columnPrefsStorageKey(kind));
  } catch {
    /* ignore */
  }
}

/**
 * Resolve visible columns: always keep `id` first; drop unknown ids.
 * @param {string} kind
 * @param {string[] | null | undefined} visibleIds
 */
export function resolveVisibleColumns(kind, visibleIds) {
  const catalog = getArtifactListColumnCatalog(kind);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const defaults = getDefaultVisibleColumnIds(kind);
  let ids =
    Array.isArray(visibleIds) && visibleIds.length > 0
      ? visibleIds.filter((id) => byId.has(id))
      : defaults;
  if (!ids.includes('id') && byId.has('id')) {
    ids = ['id', ...ids];
  }
  if (ids.length === 0) ids = defaults;
  return ids.map((id) => byId.get(id)).filter(Boolean);
}

/**
 * @param {string} kind
 * @returns {ReadonlyArray<object>}
 */
export function getArtifactListColumns(kind) {
  return resolveVisibleColumns(kind, null);
}

export { COLUMNS_BY_KIND, DEFAULT_COLUMNS, CELL_TRUNCATE, PREFS_PREFIX };
