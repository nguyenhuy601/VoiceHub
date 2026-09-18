/**
 * Phase 1 AnalysisArtifact field catalog — đủ kind RA (SCOPE/BG/BR/BPM/FR/UC/NFR).
 *
 * SoT nguồn:
 * - Workbook Requirement Analysis parse: `requirementTemplateParse.js`
 * - List columns: `client/.../artifactListColumns.js`
 * - Seed structured pack→artifact: `analysis.service.js` upsert theo kind
 *
 * Cấm: lấy schema AI-gen làm mẫu.
 */

const EDITABLE_STATUSES = Object.freeze(['draft', 'rejected']);

/** @typedef {'top'|'structured'} FieldLayer */
/** @typedef {{ key: string, layer: FieldLayer, required?: boolean, maxLen?: number, type?: 'string'|'string[]', source: string, legacy?: boolean }} FieldDef */

/** Top-level document fields (không nằm trong structured). externalKey chỉ lúc create — không editable. */
const TOP_LEVEL_EDITABLE = Object.freeze([
  Object.freeze({
    key: 'title',
    layer: 'top',
    required: true,
    maxLen: 240,
    type: 'string',
    source: 'workbook Name/Requirement/Title',
  }),
  Object.freeze({
    key: 'summary',
    layer: 'top',
    required: false,
    maxLen: 2000,
    type: 'string',
    source: 'workbook Description (FR) / short prose',
  }),
  Object.freeze({
    key: 'body',
    layer: 'top',
    required: false,
    maxLen: 20000,
    type: 'string',
    source: 'optional long prose (legacy form — hide when empty)',
    legacy: true,
  }),
]);

/**
 * FR structured — workbook Functional sheet + seed upsert FR (analysis.service).
 * Loại trừ AI/planning: suggestedSkills, estimateHours, suggestedRoleKey, sortOrder.
 * Loại trừ structured.status (trùng lifecycle artifact.status).
 */
const FR_STRUCTURED = Object.freeze([
  field('level', 'workbook Level'),
  field('parentExternalKey', 'workbook Parent ID → parentExternalId'),
  field('moduleLabel', 'workbook Module'),
  field('featureLabel', 'workbook Feature'),
  field('capabilityLabel', 'seed capabilityLabel (optional)', { legacy: true }),
  field('description', 'workbook Description'),
  field('actor', 'workbook Actor'),
  field('priority', 'workbook Priority'),
  field('acceptanceCriteria', 'workbook Acceptance Criteria', { legacy: true }),
  field('trigger', 'workbook Trigger', { legacy: true }),
  field('preconditions', 'workbook Preconditions'),
  field('mainBehavior', 'workbook Main Flow → seed mainBehavior'),
  field('mainFlow', 'workbook Main Flow alias (accept; prefer mainBehavior when seed)'),
  field('exception', 'workbook Alternative/Exception Flow', { legacy: true }),
  field('businessRule', 'workbook Business Rules', { legacy: true }),
  field('input', 'workbook Input'),
  field('output', 'workbook Output'),
  field('dataEntities', 'workbook Data / Entities (legacy form — hide when empty)', { legacy: true }),
  field('dependency', 'workbook Dependencies', { legacy: true }),
  field('assumption', 'seed assumption', { legacy: true }),
  field('constraint', 'workbook Constraints / Notes'),
  field('baNote', 'seed baNote', { legacy: true }),
  field('relatedUcKeys', 'trace FR→UC keys', { type: 'string[]', legacy: true }),
  field('brIds', 'seed linked BR ids/keys', { type: 'string[]', legacy: true }),
  field('bpmIds', 'seed linked BPM ids/keys', { type: 'string[]', legacy: true }),
  field('customerRequirementIds', 'seed CR refs', { type: 'string[]', legacy: true }),
  field('sourceReference', 'traceability sheet Source / Reference', { legacy: true }),
  field('traceRelationship', 'traceability sheet relationship', { legacy: true }),
  field('traceAnalysisStatus', 'traceability sheet analysisStatus', { legacy: true }),
]);

/**
 * UC structured — workbook Use Cases sheet + seed upsert UC.
 * Fix: seed dùng alternativeFlow (singular), không phải alternativeFlows.
 */
const UC_STRUCTURED = Object.freeze([
  field('actor', 'workbook Actor'),
  field('secondaryActor', 'seed secondaryActor', { legacy: true }),
  field('goal', 'seed goal', { legacy: true }),
  field('trigger', 'seed trigger', { legacy: true }),
  field('precondition', 'workbook Precondition', { legacy: true }),
  field('postconditions', 'seed postconditions', { legacy: true }),
  field('mainFlow', 'workbook Main Flow'),
  field('alternativeFlow', 'seed alternativeFlow', { legacy: true }),
  field('alternativeFlows', 'legacy alias → prefer alternativeFlow', { legacy: true }),
  field('exceptionFlow', 'seed exceptionFlow', { legacy: true }),
  field('businessRules', 'seed businessRules', { legacy: true }),
  field('input', 'seed input'),
  field('output', 'seed output'),
  field('priority', 'workbook Priority'),
  field('relatedFrKeys', 'workbook Related FR → keys[]', { type: 'string[]', legacy: true }),
  field('brIds', 'seed linked BR ids/keys', { type: 'string[]', legacy: true }),
  field('customerRequirementIds', 'seed CR refs', { type: 'string[]', legacy: true }),
  field('baNote', 'seed baNote', { legacy: true }),
  field('sourceReference', 'traceability sheet Source / Reference', { legacy: true }),
  field('traceRelationship', 'traceability sheet relationship', { legacy: true }),
  field('traceAnalysisStatus', 'traceability sheet analysisStatus', { legacy: true }),
]);

/** SCOPE — workbook Scope / Context in-out + seed upsert. */
const SCOPE_STRUCTURED = Object.freeze([
  field('scopeType', 'workbook Scope Type (in|out)'),
  field('description', 'workbook Description'),
]);

/** BG — workbook Business Goals + seed upsert. */
const BG_STRUCTURED = Object.freeze([
  field('statement', 'workbook Statement'),
  field('businessProblem', 'seed businessProblem', { legacy: true }),
  field('expectedBusinessOutcome', 'seed expectedBusinessOutcome', { legacy: true }),
  field('successMetric', 'workbook Success Metric'),
  field('priority', 'workbook Priority'),
  field('stakeholder', 'seed stakeholder', { legacy: true }),
  field('assumption', 'seed assumption', { legacy: true }),
  field('constraint', 'seed constraint', { legacy: true }),
  field('baNote', 'seed baNote', { legacy: true }),
  field('customerRequirementIds', 'seed CR refs', { type: 'string[]', legacy: true }),
]);

/** BR — workbook Business Rules + seed upsert. */
const BR_STRUCTURED = Object.freeze([
  field('description', 'workbook Description'),
  field('businessRule', 'seed businessRule', { legacy: true }),
  field('whenApplies', 'workbook When Applies (legacy form — hide when empty)', { legacy: true }),
  field('exception', 'workbook Exception (legacy form — hide when empty)', { legacy: true }),
  field('relatedBgKey', 'workbook Related BG'),
  field('stakeholder', 'seed stakeholder', { legacy: true }),
  field('priority', 'seed Priority'),
  field('successCriteria', 'seed successCriteria', { legacy: true }),
  field('dependency', 'seed dependency', { legacy: true }),
  field('assumption', 'seed assumption', { legacy: true }),
  field('constraint', 'seed constraint', { legacy: true }),
  field('baNote', 'seed baNote', { legacy: true }),
  field('customerRequirementIds', 'seed CR refs', { type: 'string[]', legacy: true }),
]);

/** BPM — workbook Business Process + seed upsert. */
const BPM_STRUCTURED = Object.freeze([
  field('processName', 'workbook Process Name'),
  field('processDescription', 'seed processDescription', { legacy: true }),
  field('step', 'workbook Step'),
  field('actor', 'workbook Actor'),
  field('action', 'workbook Action'),
  field('input', 'workbook Input'),
  field('output', 'workbook Output'),
  field('relatedSystems', 'workbook Related Systems (legacy form — hide when empty)', { legacy: true }),
  field('relatedBrKey', 'seed relatedBr', { legacy: true }),
  field('trigger', 'seed trigger', { legacy: true }),
  field('precondition', 'seed precondition', { legacy: true }),
  field('businessRule', 'seed businessRule', { legacy: true }),
  field('exception', 'seed exception', { legacy: true }),
  field('relatedCr', 'seed relatedCr', { legacy: true }),
  field('baNote', 'seed baNote', { legacy: true }),
]);

/** NFR — workbook Non-Functional + seed upsert. */
const NFR_STRUCTURED = Object.freeze([
  field('category', 'workbook Category'),
  field('target', 'workbook Target'),
  field('measurement', 'seed measurement', { legacy: true }),
  field('priority', 'workbook Priority'),
  field('scope', 'seed scope (prose)', { legacy: true }),
  field('constraint', 'seed constraint', { legacy: true }),
  field('verification', 'workbook Verification / Acceptance (legacy form — hide when empty)', {
    legacy: true,
  }),
  field('acceptanceCriteria', 'seed acceptanceCriteria', { legacy: true }),
  field('source', 'seed source', { legacy: true }),
  field('baNote', 'seed baNote', { legacy: true }),
  field('relatedFrKeys', 'soft FR keys', { type: 'string[]', legacy: true }),
  field('customerRequirementIds', 'seed CR refs', { type: 'string[]', legacy: true }),
]);

const CATALOG_BY_KIND = Object.freeze({
  FR: Object.freeze({
    kind: 'FR',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: FR_STRUCTURED,
  }),
  UC: Object.freeze({
    kind: 'UC',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: UC_STRUCTURED,
  }),
  SCOPE: Object.freeze({
    kind: 'SCOPE',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: SCOPE_STRUCTURED,
  }),
  BG: Object.freeze({
    kind: 'BG',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: BG_STRUCTURED,
  }),
  BR: Object.freeze({
    kind: 'BR',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: BR_STRUCTURED,
  }),
  BPM: Object.freeze({
    kind: 'BPM',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: BPM_STRUCTURED,
  }),
  NFR: Object.freeze({
    kind: 'NFR',
    wave: 1,
    topLevel: TOP_LEVEL_EDITABLE,
    structured: NFR_STRUCTURED,
  }),
});


function field(key, source, extra = {}) {
  return Object.freeze({
    key,
    layer: 'structured',
    required: false,
    maxLen: extra.maxLen ?? 4000,
    type: extra.type || 'string',
    source,
    ...(extra.legacy ? { legacy: true } : {}),
  });
}

function normalizeKind(kind) {
  return String(kind || '')
    .trim()
    .toUpperCase();
}

function isEditableStatus(status) {
  return EDITABLE_STATUSES.includes(
    String(status || '')
      .trim()
      .toLowerCase()
  );
}

/**
 * @param {string} kind
 * @returns {{ kind: string, wave: number, topLevel: FieldDef[], structured: FieldDef[] }|null}
 */
function getArtifactFieldCatalog(kind) {
  const k = normalizeKind(kind);
  return CATALOG_BY_KIND[k] || null;
}

/**
 * Kinds có catalog field (toàn bộ ANALYSIS_ARTIFACT_KINDS khi đủ).
 * @returns {string[]}
 */
function listCatalogKinds() {
  return Object.keys(CATALOG_BY_KIND);
}

/**
 * @param {string} kind
 * @param {string} status
 * @returns {{ topKeys: string[], structuredKeys: string[] }}
 */
function listEditableKeys(kind, status) {
  if (!isEditableStatus(status)) {
    return { topKeys: [], structuredKeys: [] };
  }
  const cat = getArtifactFieldCatalog(kind);
  if (!cat) {
    return { topKeys: [], structuredKeys: [] };
  }
  return {
    topKeys: cat.topLevel.map((f) => f.key),
    structuredKeys: cat.structured.map((f) => f.key),
  };
}

/**
 * Lọc body update: chỉ giữ field được phép. Kind chưa có catalog → không cho structured, chỉ chặn (Wave 2 wire).
 * @param {{ kind: string, status: string, body?: object }} input
 * @returns {{ allowed: boolean, reason?: string, top?: object, structured?: object, rejectedTop: string[], rejectedStructured: string[] }}
 */
function pickAllowedArtifactUpdate(input = {}) {
  const kind = normalizeKind(input.kind);
  const status = String(input.status || '')
    .trim()
    .toLowerCase();
  const body = input.body && typeof input.body === 'object' ? input.body : {};

  if (!isEditableStatus(status)) {
    return {
      allowed: false,
      reason: 'STATUS_NOT_EDITABLE',
      rejectedTop: Object.keys(body).filter((k) => k !== 'structured' && k !== 'reopen'),
      rejectedStructured: body.structured && typeof body.structured === 'object'
        ? Object.keys(body.structured)
        : [],
    };
  }

  const cat = getArtifactFieldCatalog(kind);
  if (!cat) {
    return {
      allowed: false,
      reason: 'KIND_CATALOG_PENDING',
      rejectedTop: Object.keys(body).filter((k) => k !== 'structured' && k !== 'reopen'),
      rejectedStructured: body.structured && typeof body.structured === 'object'
        ? Object.keys(body.structured)
        : [],
    };
  }

  const topAllow = new Set(cat.topLevel.map((f) => f.key));
  const stAllow = new Set(cat.structured.map((f) => f.key));
  const top = {};
  const rejectedTop = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === 'structured' || k === 'reopen') continue;
    if (k === 'externalKey') {
      rejectedTop.push(k);
      continue;
    }
    if (topAllow.has(k)) top[k] = v;
    else rejectedTop.push(k);
  }

  const structured = {};
  const rejectedStructured = [];
  if (body.structured !== undefined) {
    if (body.structured == null || typeof body.structured !== 'object' || Array.isArray(body.structured)) {
      return {
        allowed: false,
        reason: 'STRUCTURED_NOT_OBJECT',
        rejectedTop,
        rejectedStructured: [],
      };
    }
    for (const [k, v] of Object.entries(body.structured)) {
      if (stAllow.has(k)) structured[k] = v;
      else rejectedStructured.push(k);
    }
  }

  const hasTop = Object.keys(top).length > 0;
  const hasSt = Object.keys(structured).length > 0;
  const reopen = body.reopen === true;
  if (!hasTop && !hasSt && !reopen) {
    return {
      allowed: false,
      reason: 'EMPTY_UPDATE',
      rejectedTop,
      rejectedStructured,
    };
  }

  const out = {
    allowed: true,
    top,
    rejectedTop,
    rejectedStructured,
  };
  if (hasSt) out.structured = structured;
  if (reopen) out.reopen = true;
  return out;
}

/**
 * Resolve draft update patch for Wave 2+.
 * - Kind có catalog (FR/UC): whitelist + merge structured.
 * - Kind chưa catalog: legacy (title/summary/body + structured replace/merge keys as sent).
 * @param {{ kind: string, status: string, body?: object, existingStructured?: object, strictUnknown?: boolean }} input
 */
function resolveArtifactDraftUpdate(input = {}) {
  const kind = normalizeKind(input.kind);
  const status = String(input.status || '')
    .trim()
    .toLowerCase();
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const existingStructured =
    input.existingStructured && typeof input.existingStructured === 'object'
      ? input.existingStructured
      : {};
  const strictUnknown = Boolean(input.strictUnknown);

  if (!isEditableStatus(status)) {
    const err = new Error('Chỉ sửa được artifact draft/rejected');
    err.statusCode = 400;
    err.errorCode = 'STATUS_NOT_EDITABLE';
    throw err;
  }

  const cat = getArtifactFieldCatalog(kind);
  if (!cat) {
    return {
      mode: 'legacy',
      top: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.summary !== undefined ? { summary: body.summary } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
      },
      structured:
        body.structured !== undefined && typeof body.structured === 'object' && !Array.isArray(body.structured)
          ? { ...existingStructured, ...body.structured }
          : undefined,
      reopen: body.reopen === true,
      rejectedTop: [],
      rejectedStructured: [],
    };
  }

  const picked = pickAllowedArtifactUpdate({ kind, status, body });
  if (!picked.allowed) {
    const err = new Error(
      picked.reason === 'EMPTY_UPDATE'
        ? 'Không có field hợp lệ để cập nhật'
        : picked.reason === 'STRUCTURED_NOT_OBJECT'
          ? 'structured phải là object'
          : 'Không được sửa artifact ở trạng thái này'
    );
    err.statusCode = 400;
    err.errorCode = picked.reason || 'ARTIFACT_UPDATE_DENIED';
    err.details = {
      rejectedTop: picked.rejectedTop || [],
      rejectedStructured: picked.rejectedStructured || [],
    };
    throw err;
  }

  if (
    strictUnknown &&
    ((picked.rejectedTop && picked.rejectedTop.length) ||
      (picked.rejectedStructured && picked.rejectedStructured.length))
  ) {
    const err = new Error('Có field không nằm trong catalog được phép sửa');
    err.statusCode = 400;
    err.errorCode = 'ARTIFACT_FIELD_NOT_ALLOWED';
    err.details = {
      rejectedTop: picked.rejectedTop || [],
      rejectedStructured: picked.rejectedStructured || [],
    };
    throw err;
  }

  const topLen = Object.fromEntries(cat.topLevel.map((f) => [f.key, f.maxLen]));
  const top = {};
  for (const [k, v] of Object.entries(picked.top || {})) {
    const max = topLen[k] || 2000;
    top[k] = String(v ?? '').trim().slice(0, max);
  }

  /** Merge rồi prune: bỏ key không thuộc catalog (vd. AI junk còn sót trong DB). */
  let structured;
  if (picked.structured) {
    const merged = { ...existingStructured, ...picked.structured };
    const allow = new Set(cat.structured.map((f) => f.key));
    structured = {};
    for (const [k, v] of Object.entries(merged)) {
      if (allow.has(k)) structured[k] = v;
    }
  }

  return {
    mode: 'catalog',
    top,
    structured,
    reopen: picked.reopen === true,
    rejectedTop: picked.rejectedTop || [],
    rejectedStructured: picked.rejectedStructured || [],
  };
}

module.exports = {
  EDITABLE_STATUSES,
  CATALOG_BY_KIND,
  getArtifactFieldCatalog,
  listCatalogKinds,
  listEditableKeys,
  pickAllowedArtifactUpdate,
  resolveArtifactDraftUpdate,
  isEditableStatus,
  normalizeKind,
};
