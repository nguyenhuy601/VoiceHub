/**
 * FE mirror of project-service analysisArtifactFieldCatalog (đủ kind RA).
 * Keep keys in sync with BE — do not invent AI fields.
 *
 * G3 / DEC-5: PRIMARY = workbook columns (always on form).
 * LEGACY = seed/trace/extra — ẩn khi DB trống; vẫn hydrate + PATCH.
 */

export const ARTIFACT_EDITABLE_STATUSES = Object.freeze(['draft', 'changes_requested']);

/** @typedef {{ key: string, labelKey: string, control?: 'input'|'textarea'|'tags', rows?: number, legacy?: boolean }} FormFieldDef */

const f = (key, labelKey, control = 'input', extra = {}) =>
  Object.freeze({ key, labelKey, control, ...extra });

const TOP_FIELDS = Object.freeze([
  f('title', 'workspace.phase1ColTitle', 'input'),
  f('summary', 'workspace.phase1Summary', 'textarea', { rows: 3 }),
  f('body', 'workspace.phase1FieldBody', 'textarea', { rows: 4, legacy: true }),
]);

/** FR — đủ cột Excel 05_FR (primary); chỉ trace/AI phụ = legacy. */
const FR_STRUCTURED = Object.freeze([
  f('priority', 'workspace.phase1ColPriority'),
  f('level', 'workspace.phase1ColLevel'),
  f('parentExternalKey', 'workspace.phase1FieldParentKey'),
  f('moduleLabel', 'workspace.phase1ColModule'),
  f('featureLabel', 'workspace.phase1ColFeature'),
  f('capabilityLabel', 'workspace.phase1FieldCapability'),
  f('description', 'workspace.phase1ColDescription', 'textarea', { rows: 3 }),
  f('actor', 'workspace.phase1ColActor'),
  f('acceptanceCriteria', 'workspace.phase1FieldAcceptanceCriteria', 'textarea', { rows: 3 }),
  f('trigger', 'workspace.phase1FieldTrigger'),
  f('preconditions', 'workspace.phase1ColPrecondition', 'textarea', { rows: 2 }),
  f('mainBehavior', 'workspace.phase1FieldMainFlow', 'textarea', { rows: 4 }),
  f('exception', 'workspace.phase1ColException', 'textarea', { rows: 2 }),
  f('businessRule', 'workspace.phase1FieldBusinessRules', 'textarea', { rows: 2 }),
  f('input', 'workspace.phase1FieldInput'),
  f('output', 'workspace.phase1FieldOutput'),
  f('dataEntities', 'workspace.phase1FieldDataEntities', 'input', { legacy: true }),
  f('dependency', 'workspace.phase1FieldDependency'),
  f('assumption', 'workspace.phase1FieldAssumption', 'textarea', { rows: 2 }),
  f('constraint', 'workspace.phase1FieldConstraint', 'textarea', { rows: 2 }),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
  f('relatedUcKeys', 'workspace.phase1UseCases', 'tags', { legacy: true }),
  f('brIds', 'workspace.phase1FieldBrIds', 'tags'),
  f('bpmIds', 'workspace.phase1FieldBpmIds', 'tags'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('sourceReference', 'workspace.phase1FieldSourceReference', 'input', { legacy: true }),
  f('traceRelationship', 'workspace.phase1FieldTraceRelationship', 'input', { legacy: true }),
  f('traceAnalysisStatus', 'workspace.phase1FieldTraceAnalysisStatus', 'input', { legacy: true }),
]);

const UC_STRUCTURED = Object.freeze([
  f('priority', 'workspace.phase1ColPriority'),
  f('actor', 'workspace.phase1ColActor'),
  f('secondaryActor', 'workspace.phase1FieldSecondaryActor'),
  f('goal', 'workspace.phase1FieldGoal', 'textarea', { rows: 2 }),
  f('trigger', 'workspace.phase1FieldTrigger'),
  f('precondition', 'workspace.phase1ColPrecondition', 'textarea', { rows: 2 }),
  f('postconditions', 'workspace.phase1FieldPostconditions', 'textarea', { rows: 2 }),
  f('mainFlow', 'workspace.phase1FieldMainFlow', 'textarea', { rows: 4 }),
  f('alternativeFlow', 'workspace.phase1FieldAlternativeFlow', 'textarea', { rows: 3 }),
  f('exceptionFlow', 'workspace.phase1ColException', 'textarea', { rows: 2 }),
  f('businessRules', 'workspace.phase1FieldBusinessRules', 'textarea', { rows: 2 }),
  f('input', 'workspace.phase1FieldInput'),
  f('output', 'workspace.phase1FieldOutput'),
  f('relatedFrKeys', 'workspace.phase1ColRelatedFr', 'tags'),
  f('brIds', 'workspace.phase1FieldBrIds', 'tags'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
  f('sourceReference', 'workspace.phase1FieldSourceReference', 'input', { legacy: true }),
  f('traceRelationship', 'workspace.phase1FieldTraceRelationship', 'input', { legacy: true }),
  f('traceAnalysisStatus', 'workspace.phase1FieldTraceAnalysisStatus', 'input', { legacy: true }),
]);

/** SCOPE — đủ cột Excel 08_Scope (primary, luôn hiện form). */
const SCOPE_STRUCTURED = Object.freeze([
  f('scopeType', 'workspace.phase1ColScopeType'),
  f('description', 'workspace.phase1ColDescription', 'textarea', { rows: 3 }),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('source', 'workspace.phase1ColWorkbookSource'),
  f('dateRaised', 'workspace.phase1ColDateRaised'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const BG_STRUCTURED = Object.freeze([
  f('statement', 'workspace.phase1FieldGoal', 'textarea', { rows: 3 }),
  f('businessProblem', 'workspace.phase1FieldBusinessProblem', 'textarea', { rows: 2 }),
  f('expectedBusinessOutcome', 'workspace.phase1FieldExpectedOutcome', 'textarea', { rows: 2 }),
  f('successMetric', 'workspace.phase1FieldSuccessCriteria', 'textarea', { rows: 2 }),
  f('priority', 'workspace.phase1ColPriority'),
  f('stakeholder', 'workspace.phase1FieldStakeholder'),
  f('assumption', 'workspace.phase1FieldAssumption', 'textarea', { rows: 2 }),
  f('constraint', 'workspace.phase1FieldConstraint', 'textarea', { rows: 2 }),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const BR_STRUCTURED = Object.freeze([
  f('description', 'workspace.phase1ColDescription', 'textarea', { rows: 3 }),
  f('businessRule', 'workspace.phase1FieldBusinessRules', 'textarea', { rows: 2 }),
  f('whenApplies', 'workspace.phase1ColWhenApplies', 'textarea', { rows: 2, legacy: true }),
  f('exception', 'workspace.phase1ColException', 'textarea', { rows: 2, legacy: true }),
  f('relatedBgKey', 'workspace.phase1ColRelatedBg'),
  f('stakeholder', 'workspace.phase1FieldStakeholder'),
  f('priority', 'workspace.phase1ColPriority'),
  f('successCriteria', 'workspace.phase1FieldSuccessCriteria', 'textarea', { rows: 2 }),
  f('dependency', 'workspace.phase1FieldDependency'),
  f('assumption', 'workspace.phase1FieldAssumption', 'textarea', { rows: 2 }),
  f('constraint', 'workspace.phase1FieldConstraint', 'textarea', { rows: 2 }),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const BPM_STRUCTURED = Object.freeze([
  f('processName', 'workspace.phase1ColProcessName'),
  f('processDescription', 'workspace.phase1FieldProcessDescription', 'textarea', { rows: 3 }),
  f('step', 'workspace.phase1ColStep'),
  f('actor', 'workspace.phase1ColActor'),
  f('action', 'workspace.phase1ColAction', 'textarea', { rows: 2 }),
  f('input', 'workspace.phase1FieldInput'),
  f('output', 'workspace.phase1FieldOutput'),
  f('relatedSystems', 'workspace.phase1ColRelatedSystems', 'input', { legacy: true }),
  f('relatedBrKey', 'workspace.phase1FieldRelatedBr'),
  f('trigger', 'workspace.phase1FieldTrigger'),
  f('precondition', 'workspace.phase1ColPrecondition', 'textarea', { rows: 2 }),
  f('businessRule', 'workspace.phase1FieldBusinessRules', 'textarea', { rows: 2 }),
  f('exception', 'workspace.phase1ColException', 'textarea', { rows: 2 }),
  f('relatedCr', 'workspace.phase1FieldRelatedCr'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const NFR_STRUCTURED = Object.freeze([
  f('category', 'workspace.phase1ColCategory'),
  f('requirement', 'workspace.phase1ColRequirement', 'textarea', { rows: 2 }),
  f('target', 'workspace.phase1ColTarget', 'textarea', { rows: 2 }),
  f('measurement', 'workspace.phase1FieldMeasurement'),
  f('priority', 'workspace.phase1ColPriority'),
  f('scope', 'workspace.phase1FieldNfrScope', 'textarea', { rows: 2 }),
  f('constraint', 'workspace.phase1FieldConstraint', 'textarea', { rows: 2 }),
  f('verification', 'workspace.phase1FieldVerification', 'textarea', { rows: 2, legacy: true }),
  f('acceptanceCriteria', 'workspace.phase1FieldAcceptanceCriteria', 'textarea', { rows: 2 }),
  f('source', 'workspace.phase1ColWorkbookSource'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
  f('relatedFrKeys', 'workspace.phase1ColRelatedFr', 'tags', { legacy: true }),
]);

const INTERFACE_STRUCTURED = Object.freeze([
  f('interfaceName', 'workspace.phase1ColInterfaceName'),
  f('interfaceType', 'workspace.phase1ColInterfaceType'),
  f('direction', 'workspace.phase1ColDirection'),
  f('protocol', 'workspace.phase1ColProtocol'),
  f('description', 'workspace.phase1ColDescription', 'textarea', { rows: 3 }),
  f('relatedArtifactIds', 'workspace.phase1FieldRelatedArtifacts', 'tags'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const DATA_STRUCTURED = Object.freeze([
  f('entity', 'workspace.phase1ColEntity'),
  f('attributes', 'workspace.phase1ColAttributes', 'textarea', { rows: 3 }),
  f('validationRules', 'workspace.phase1ColValidationRules', 'textarea', { rows: 2 }),
  f('description', 'workspace.phase1ColDescription', 'textarea', { rows: 2, legacy: true }),
  f('relatedArtifactIds', 'workspace.phase1FieldRelatedArtifacts', 'tags'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const GLOSSARY_STRUCTURED = Object.freeze([
  f('term', 'workspace.phase1ColTerm'),
  f('definition', 'workspace.phase1ColDefinition', 'textarea', { rows: 3 }),
  f('relatedArtifactIds', 'workspace.phase1FieldRelatedArtifacts', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const ASSUMPTION_STRUCTURED = Object.freeze([
  f('text', 'workspace.phase1ColAssumptionText', 'textarea', { rows: 3 }),
  f('impactIfInvalid', 'workspace.phase1ColImpactIfInvalid', 'textarea', { rows: 2 }),
  f('relatedArtifactIds', 'workspace.phase1FieldRelatedArtifacts', 'tags'),
  f('customerRequirementIds', 'workspace.phase1FieldCrIds', 'tags'),
  f('status', 'workspace.phase1ColAnalysisStatus'),
  f('baNote', 'workspace.phase1FieldBaNote', 'textarea', { rows: 2 }),
]);

const CATALOG = Object.freeze({
  FR: Object.freeze({ kind: 'FR', topLevel: TOP_FIELDS, structured: FR_STRUCTURED }),
  UC: Object.freeze({ kind: 'UC', topLevel: TOP_FIELDS, structured: UC_STRUCTURED }),
  SCOPE: Object.freeze({ kind: 'SCOPE', topLevel: TOP_FIELDS, structured: SCOPE_STRUCTURED }),
  BG: Object.freeze({ kind: 'BG', topLevel: TOP_FIELDS, structured: BG_STRUCTURED }),
  BR: Object.freeze({ kind: 'BR', topLevel: TOP_FIELDS, structured: BR_STRUCTURED }),
  BPM: Object.freeze({ kind: 'BPM', topLevel: TOP_FIELDS, structured: BPM_STRUCTURED }),
  NFR: Object.freeze({ kind: 'NFR', topLevel: TOP_FIELDS, structured: NFR_STRUCTURED }),
  INTERFACE: Object.freeze({ kind: 'INTERFACE', topLevel: TOP_FIELDS, structured: INTERFACE_STRUCTURED }),
  DATA: Object.freeze({ kind: 'DATA', topLevel: TOP_FIELDS, structured: DATA_STRUCTURED }),
  GLOSSARY: Object.freeze({ kind: 'GLOSSARY', topLevel: TOP_FIELDS, structured: GLOSSARY_STRUCTURED }),
  ASSUMPTION: Object.freeze({ kind: 'ASSUMPTION', topLevel: TOP_FIELDS, structured: ASSUMPTION_STRUCTURED }),
});

export function normalizeArtifactKind(kind) {
  return String(kind || '')
    .trim()
    .toUpperCase();
}

export function isArtifactContentEditable(status) {
  return ARTIFACT_EDITABLE_STATUSES.includes(
    String(status || '')
      .trim()
      .toLowerCase()
  );
}

export function getArtifactFieldCatalog(kind) {
  return CATALOG[normalizeArtifactKind(kind)] || null;
}

export function listCatalogKinds() {
  return Object.keys(CATALOG);
}

/** Legacy form fields — ẩn khi DB trống (DEC-5 / G3). */
export function isLegacyFormField(field) {
  return Boolean(field?.legacy);
}

/**
 * Soft-trace keys (DEC R3) — luôn hiện để BA gắn related kể cả khi DB trống.
 * Không áp dụng hide-empty của G3 (khác whenApplies / dataEntities / …).
 */
const SOFT_TRACE_FIELD_KEYS = new Set([
  'relatedUcKeys',
  'relatedFrKeys',
  'relatedBgKey',
  'relatedBrKey',
  'brIds',
  'bpmIds',
  'relatedArtifactIds',
  'customerRequirementIds',
]);

export function isSoftTraceFormField(field) {
  return SOFT_TRACE_FIELD_KEYS.has(String(field?.key || ''));
}

/**
 * Có giá trị structured thật (kèm alias) — dùng để quyết định hiện legacy.
 */
export function hasStructuredFieldValue(st, kind, field) {
  const type = field?.control === 'tags' ? 'string[]' : 'string';
  const value = readStructuredField(st, kind, field.key, type);
  if (Array.isArray(value)) return value.length > 0;
  return String(value ?? '').trim().length > 0;
}

/**
 * FR Module/Capability/Feature — nhiều cột Requirement-level trống theo Excel.
 * Chỉ hiện field hierarchy + soft-trace; field chi tiết chỉ hiện khi DB có giá trị.
 */
const FR_HIERARCHY_CORE_KEYS = new Set([
  'priority',
  'level',
  'parentExternalKey',
  'moduleLabel',
  'featureLabel',
  'capabilityLabel',
  'description',
  'actor',
  'baNote',
  'status',
]);

function isFrHierarchyLevel(st) {
  const level = String(st?.level || '')
    .trim()
    .toLowerCase();
  return level === 'module' || level === 'capability' || level === 'feature';
}

/**
 * PRIMARY + soft-trace luôn hiện; LEGACY nội dung khác chỉ hiện khi DB có giá trị (G3).
 * FR hierarchy: ẩn field chi tiết trống (tránh form “trắng” trên Module/Capability/Feature).
 * @param {string} kind
 * @param {object} [artifact]
 */
export function listVisibleStructuredFields(kind, artifact) {
  const cat = getArtifactFieldCatalog(kind);
  if (!cat) return [];
  const st = artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  const frSparse = normalizeArtifactKind(kind) === 'FR' && isFrHierarchyLevel(st);
  return cat.structured.filter((field) => {
    if (isSoftTraceFormField(field)) return true;
    if (frSparse && !FR_HIERARCHY_CORE_KEYS.has(field.key)) {
      return hasStructuredFieldValue(st, kind, field);
    }
    if (!isLegacyFormField(field)) return true;
    return hasStructuredFieldValue(st, kind, field);
  });
}

/**
 * Top-level: title/summary luôn; body (legacy) chỉ khi có giá trị.
 */
export function listVisibleTopFields(kind, artifact) {
  const cat = getArtifactFieldCatalog(kind);
  const tops = cat?.topLevel || TOP_FIELDS;
  return tops.filter((field) => {
    if (!isLegacyFormField(field)) return true;
    return String(artifact?.[field.key] || '').trim().length > 0;
  });
}

/** Tags field: array ↔ comma-separated string for inputs. */
export function tagsToInput(value) {
  if (Array.isArray(value)) return value.map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  return String(value || '').trim();
}

export function inputToTags(text) {
  return String(text || '')
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Alias keys còn sót trong DB/seed (khác workbook canonical).
 * Form đọc theo thứ tự: key chuẩn rồi alias — khớp logic list columns.
 * @type {Record<string, Record<string, string[]>>}
 */
const STRUCTURED_READ_ALIASES = Object.freeze({
  BG: Object.freeze({
    statement: Object.freeze(['statement', 'goal']),
    stakeholder: Object.freeze(['stakeholder', 'owner']),
    successMetric: Object.freeze(['successMetric', 'successCriteria']),
  }),
  BR: Object.freeze({
    description: Object.freeze(['description', 'statement', 'businessRule']),
    businessRule: Object.freeze(['businessRule', 'statement']),
  }),
  BPM: Object.freeze({
    actor: Object.freeze(['actor', 'actors']),
  }),
  NFR: Object.freeze({
    target: Object.freeze(['target', 'metric', 'measurement']),
    measurement: Object.freeze(['measurement', 'metric']),
    requirement: Object.freeze(['requirement', 'name']),
  }),
  FR: Object.freeze({
    mainBehavior: Object.freeze(['mainBehavior', 'mainFlow']),
    mainFlow: Object.freeze(['mainFlow', 'mainBehavior']),
    description: Object.freeze(['description']),
    dependency: Object.freeze(['dependency', 'frDependencies']),
    constraint: Object.freeze(['constraint', 'constraintsNotes']),
  }),
  SCOPE: Object.freeze({
    description: Object.freeze(['description']),
  }),
});

/**
 * Đọc giá trị structured cho 1 field catalog (kèm alias).
 * @param {object} st
 * @param {string} kind
 * @param {string} key
 * @param {'string'|'string[]'|undefined} type
 */
export function readStructuredField(st, kind, key, type) {
  const src = st && typeof st === 'object' ? st : {};
  const k = normalizeArtifactKind(kind);
  const aliases = STRUCTURED_READ_ALIASES[k]?.[key] || [key];
  for (const alias of aliases) {
    const raw = src[alias];
    if (raw == null || raw === '') continue;
    if (type === 'string[]' || Array.isArray(raw)) return raw;
    const s = String(raw).trim();
    if (s) return s;
  }
  return type === 'string[]' ? [] : '';
}

/**
 * Build editable form state from artifact + catalog.
 * Hydrate alias keys + (một số kind) fallback summary giống cột list.
 */
export function buildArtifactFormState(artifact, kind) {
  const cat = getArtifactFieldCatalog(kind);
  const st = artifact?.structured && typeof artifact.structured === 'object' ? artifact.structured : {};
  const summary = String(artifact?.summary || '');
  const top = {
    title: String(artifact?.title || ''),
    summary,
    body: String(artifact?.body || ''),
  };
  const structured = {};
  if (cat) {
    const k = normalizeArtifactKind(kind);
    for (const field of cat.structured) {
      let value = readStructuredField(st, kind, field.key, field.control === 'tags' ? 'string[]' : 'string');
      // Khớp list: BG statement / BR description / SCOPE description có thể lấy từ summary|title
      if ((value == null || value === '' || (Array.isArray(value) && !value.length)) && summary) {
        if ((k === 'BG' && field.key === 'statement') || (k === 'BR' && field.key === 'description')) {
          value = summary;
        }
      }
      if ((value == null || value === '') && k === 'SCOPE' && field.key === 'description') {
        value = String(artifact?.title || '');
      }
      if ((value == null || value === '') && k === 'BPM' && field.key === 'processName') {
        value = String(artifact?.title || '');
      }
      if ((value == null || value === '') && k === 'NFR' && field.key === 'requirement') {
        value = String(artifact?.title || '');
      }
      if ((value == null || value === '') && k === 'FR' && field.key === 'description') {
        value = String(artifact?.title || summary || '');
      }
      if (field.control === 'tags') structured[field.key] = tagsToInput(value);
      else structured[field.key] = value == null ? '' : String(value);
    }
  }
  return { top, structured };
}

/**
 * Diff form → PATCH body (only changed fields).
 */
export function buildArtifactUpdateBody(form, baseline, kind) {
  const cat = getArtifactFieldCatalog(kind);
  const body = {};
  const top = {};
  for (const key of ['title', 'summary', 'body']) {
    const next = String(form.top?.[key] ?? '');
    const prev = String(baseline.top?.[key] ?? '');
    if (next !== prev) top[key] = next;
  }
  if (Object.keys(top).length) Object.assign(body, top);

  if (!cat) {
    return body;
  }

  const structured = {};
  for (const field of cat.structured) {
    const rawNext = form.structured?.[field.key];
    const rawPrev = baseline.structured?.[field.key];
    if (field.control === 'tags') {
      const nextArr = inputToTags(rawNext);
      const prevArr = inputToTags(rawPrev);
      if (nextArr.join('\0') !== prevArr.join('\0')) structured[field.key] = nextArr;
    } else {
      const next = String(rawNext ?? '');
      const prev = String(rawPrev ?? '');
      if (next !== prev) structured[field.key] = next;
    }
  }
  if (Object.keys(structured).length) body.structured = structured;
  return body;
}
