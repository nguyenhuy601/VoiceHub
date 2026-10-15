/**
 * Customer Raw → Analysis section derive policy (RULE-RAW-DERIVE-01…05).
 * Analysis workbook path keeps no-cross-fill / RULE-EMPTY.
 *
 * Wave-1 trim: interface / assumption removed from derive.
 * Default unlock: full LLM catalog (bg,br,uc,bpm,data,nfr,scope).
 * Deterministic: actors only (scope extract-first runs separately in applyRawSectionDerive).
 */

/** Full LLM catalog (registry / docs). Runtime active set may be smaller via env. */
const LLM_DERIVE_SECTIONS = Object.freeze([
  'bg',
  'br',
  'uc',
  'bpm',
  'data',
  'nfr',
  'scope',
  'actors',
]);

/** Default active LLM derive order — full unlock for remaining Gate1 sections. */
const DEFAULT_ACTIVE_LLM_DERIVE_SECTIONS = Object.freeze([
  'bg',
  'br',
  'uc',
  'bpm',
  'data',
  'nfr',
  'scope',
  'actors',
]);

/** Default locked LLM sections (empty when full unlock). */
const DEFAULT_LOCKED_LLM_DERIVE_SECTIONS = Object.freeze([]);

/** Deterministic catalog (no LLM) — actors only after Assumption trim. */
const DETERMINISTIC_RAW_SECTIONS = Object.freeze(['actors']);

/** Default: actors (Customer Raw fill). */
const DEFAULT_ACTIVE_DETERMINISTIC_RAW_SECTIONS = Object.freeze(['actors']);

const LLM_DERIVE_SET = new Set(LLM_DERIVE_SECTIONS);
const DETERMINISTIC_RAW_SET = new Set(DETERMINISTIC_RAW_SECTIONS);

/**
 * Kill-switch: default ON. Set PHASE1_RAW_SECTION_DERIVE=0 to disable.
 * @param {NodeJS.ProcessEnv} [env]
 */
function isRawSectionDeriveEnabled(env = process.env) {
  const raw = String(env.PHASE1_RAW_SECTION_DERIVE ?? '1').trim().toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'off';
}

/**
 * @param {string|undefined} raw
 * @param {readonly string[]} fallback
 */
function parseSectionList(raw, fallback) {
  if (raw == null || !String(raw).trim()) return [...fallback];
  return String(raw)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Active LLM derive engines in run order.
 * @param {NodeJS.ProcessEnv} [env]
 */
function getActiveLlmDeriveSections(env = process.env) {
  const list = parseSectionList(env.PHASE1_RAW_DERIVE_SECTIONS, DEFAULT_ACTIVE_LLM_DERIVE_SECTIONS);
  return list.filter((id) => LLM_DERIVE_SET.has(id));
}

/**
 * Active deterministic Raw sections (default: actors).
 * @param {NodeJS.ProcessEnv} [env]
 */
function getActiveDeterministicRawSections(env = process.env) {
  const list = parseSectionList(
    env.PHASE1_RAW_DERIVE_DETERMINISTIC,
    DEFAULT_ACTIVE_DETERMINISTIC_RAW_SECTIONS
  );
  return list.filter((id) => DETERMINISTIC_RAW_SET.has(id));
}

/**
 * @param {string} engineId
 * @param {NodeJS.ProcessEnv} [env]
 */
function isLlmDeriveSectionLocked(engineId, env = process.env) {
  const id = String(engineId || '');
  if (!LLM_DERIVE_SET.has(id)) return false;
  return !getActiveLlmDeriveSections(env).includes(id);
}

/**
 * @param {string} engineId
 * @param {NodeJS.ProcessEnv} [env]
 */
function isDeterministicRawSectionLocked(engineId, env = process.env) {
  const id = String(engineId || '');
  if (!DETERMINISTIC_RAW_SET.has(id)) return false;
  return !getActiveDeterministicRawSections(env).includes(id);
}

/**
 * Mirror project-service workbookDiagnostic.isCustomerRawIntakePack (pack-shaped).
 * @param {object} pack
 */
function isCustomerRawIntakePack(pack) {
  const form = pack?.aiAnalysis?.formValidation;
  if (form?.ok === true) return true;
  if (form?.recognizedAsCustomerRaw) return true;
  const tt = String(form?.templateType || '').trim().toLowerCase();
  if (tt === 'customerraw' || (tt.includes('customer') && tt.includes('raw'))) return true;

  const rows = pack?.aiAnalysis?.customerRawRows;
  if (rows && typeof rows === 'object') {
    for (const key of ['businessRequests', 'references', 'requirementSources']) {
      if (Array.isArray(rows[key]) && rows[key].length) return true;
    }
  }

  const diag = pack?.aiAnalysis?.workbookDiagnostic;
  if (diag?.intakeKind === 'customer_raw') return true;

  const list = pack?.aiAnalysis?.workbookDiagnostics;
  if (Array.isArray(list)) {
    if (list.some((d) => d?.intakeKind === 'customer_raw' || d?.source === 'customer_raw')) {
      return true;
    }
  }

  // Semantic Contract: snapshot/pack canonicalRaw is Customer Raw intake SoT
  const cr = pack?.aiAnalysis?.canonicalRaw;
  if (cr && typeof cr === 'object') {
    const tt = String(cr.templateType || cr.templateVersion || '').toLowerCase();
    if (tt.includes('customer') || tt.includes('1.1-raw') || cr.registryVersion) {
      return true;
    }
  }
  return false;
}

/**
 * Enough Raw material to attempt derive (RULE-RAW-DERIVE-01).
 * @param {object} pack
 */
function hasRawDeriveSource(pack) {
  if (Array.isArray(pack?.functionalRequirements) && pack.functionalRequirements.length > 0) {
    return true;
  }
  const brq = pack?.aiAnalysis?.customerRawRows?.businessRequests;
  if (Array.isArray(brq) && brq.length > 0) return true;

  const overview = pack?.overview || {};
  if (
    String(overview.projectObjective || overview.requirementName || overview.businessScope || '').trim()
  ) {
    return true;
  }
  return false;
}

/**
 * Whether this engine should use Raw derive path (not sheet ingest).
 * Locked sections return false (stamped DERIVE_LOCKED separately).
 * @param {string} engineId
 * @param {object} pack
 * @param {NodeJS.ProcessEnv} [env]
 */
function shouldRawDeriveSection(engineId, pack, env = process.env) {
  if (!isRawSectionDeriveEnabled(env)) return false;
  if (!isCustomerRawIntakePack(pack)) return false;
  if (!hasRawDeriveSource(pack)) return false;
  const id = String(engineId || '');
  if (LLM_DERIVE_SET.has(id)) {
    return getActiveLlmDeriveSections(env).includes(id);
  }
  if (DETERMINISTIC_RAW_SET.has(id)) {
    return getActiveDeterministicRawSections(env).includes(id);
  }
  return false;
}

function isLlmDeriveSection(engineId) {
  return LLM_DERIVE_SET.has(String(engineId || ''));
}

function isDeterministicRawSection(engineId) {
  return DETERMINISTIC_RAW_SET.has(String(engineId || ''));
}

/**
 * Sections that must succeed or abort phase_what.
 * Default critical core: bg,br,uc,bpm,data — nfr/scope soft-gap when empty (still LLM-attempted).
 * Override via PHASE1_RAW_DERIVE_CRITICAL.
 */
const DEFAULT_CRITICAL_LLM_DERIVE_SECTIONS = Object.freeze(['bg', 'br', 'uc', 'bpm', 'data']);

function isCriticalRawDeriveSection(engineId, env = process.env) {
  const id = String(engineId || '');
  if (!getActiveLlmDeriveSections(env).includes(id)) return false;
  const critical = parseSectionList(
    env.PHASE1_RAW_DERIVE_CRITICAL,
    DEFAULT_CRITICAL_LLM_DERIVE_SECTIONS
  );
  return critical.includes(id);
}

module.exports = {
  LLM_DERIVE_SECTIONS,
  DEFAULT_ACTIVE_LLM_DERIVE_SECTIONS,
  DEFAULT_LOCKED_LLM_DERIVE_SECTIONS,
  DETERMINISTIC_RAW_SECTIONS,
  DEFAULT_ACTIVE_DETERMINISTIC_RAW_SECTIONS,
  isRawSectionDeriveEnabled,
  getActiveLlmDeriveSections,
  getActiveDeterministicRawSections,
  isLlmDeriveSectionLocked,
  isDeterministicRawSectionLocked,
  isCustomerRawIntakePack,
  hasRawDeriveSource,
  shouldRawDeriveSection,
  isLlmDeriveSection,
  isDeterministicRawSection,
  isCriticalRawDeriveSection,
  DEFAULT_CRITICAL_LLM_DERIVE_SECTIONS,
};
