/**
 * Per-section derive config — same pipeline as BG, section-specific input/output.
 * Unlock order via PHASE1_RAW_DERIVE_SECTIONS (comma list).
 *
 * Wave-1: interface removed; nfr + scope added to LLM catalog.
 */

const LLM_DERIVE_ORDER = Object.freeze([
  'bg',
  'br',
  'uc',
  'bpm',
  'data',
  'nfr',
  'scope',
  'actors',
]);

const SECTION_BY_ENGINE = Object.freeze({
  bg: 'businessGoals',
  br: 'businessRules',
  bpm: 'processes',
  uc: 'useCases',
  data: 'entities',
  nfr: 'nonFunctionalRequirements',
  scope: 'scope',
  actors: 'actors',
});

const RESULT_KEY_BY_ENGINE = Object.freeze({
  bg: 'goals',
  br: 'rules',
  bpm: 'processes',
  uc: 'useCases',
  data: 'entities',
  nfr: 'nfrs',
  scope: 'scopeItems',
  actors: 'actors',
});

const RESULT_ALIASES = Object.freeze({
  bg: ['businessGoals', 'goal'],
  br: ['businessRules', 'business_rules'],
  bpm: ['businessProcesses', 'business_processes'],
  uc: ['use_cases'],
  data: ['domainEntities', 'domain_entities'],
  nfr: ['nonFunctionalRequirements', 'nfr'],
  scope: ['scope', 'scopes'],
  actors: ['actor', 'roles'],
});

const PREFIX_BY_ENGINE = Object.freeze({
  bg: 'BG',
  br: 'BR',
  bpm: 'BPM',
  uc: 'UC',
  data: 'ENT',
  nfr: 'NFR',
  scope: 'SC',
  actors: 'ACT',
});

/** Default num_predict per section (3B-friendly). Override via PHASE1_<SEC>_DERIVE_MAX_TOKENS. */
const DEFAULT_MAX_TOKENS = Object.freeze({
  bg: 448,
  br: 512,
  uc: 640,
  bpm: 320,
  data: 320,
  nfr: 384,
  scope: 320,
  actors: 320,
});

const SECTION_LABEL = Object.freeze({
  bg: 'BG',
  br: 'BR',
  bpm: 'BPM',
  uc: 'UC',
  data: 'Data',
  nfr: 'NFR',
  scope: 'Scope',
  actors: 'Actors',
});

function resolveSectionMaxTokens(engineId, env = process.env) {
  const id = String(engineId || '').toLowerCase();
  const envKey = `PHASE1_${id.toUpperCase()}_DERIVE_MAX_TOKENS`;
  const n = Number(env[envKey]);
  if (Number.isFinite(n) && n >= 128) return Math.min(2048, Math.floor(n));
  if (id === 'bg') {
    const legacy = Number(env.PHASE1_BG_DERIVE_MAX_TOKENS);
    if (Number.isFinite(legacy) && legacy >= 128) return Math.min(2048, Math.floor(legacy));
  }
  return DEFAULT_MAX_TOKENS[id] || 384;
}

function resolveSectionTimeoutMs(engineId, env = process.env) {
  const id = String(engineId || '').toLowerCase();
  const envKey = `PHASE1_${id.toUpperCase()}_DERIVE_TIMEOUT_MS`;
  const n = Number(env[envKey]);
  if (Number.isFinite(n) && n >= 5000) return Math.min(600000, Math.floor(n));
  const planning = Number(env.OLLAMA_PLANNING_TIMEOUT_MS || env.OLLAMA_TIMEOUT_MS);
  if (Number.isFinite(planning) && planning >= 5000) return Math.min(600000, Math.floor(planning));
  return 180000;
}

/** Smaller ctx for slim V2 prompts — speeds 3B vs global OLLAMA_NUM_CTX=4096. */
function resolveDeriveNumCtx(env = process.env) {
  const n = Number(env.PHASE1_DERIVE_NUM_CTX);
  if (Number.isFinite(n) && n >= 1024) return Math.min(8192, Math.floor(n));
  return 2048;
}

module.exports = {
  LLM_DERIVE_ORDER,
  SECTION_BY_ENGINE,
  RESULT_KEY_BY_ENGINE,
  RESULT_ALIASES,
  PREFIX_BY_ENGINE,
  DEFAULT_MAX_TOKENS,
  SECTION_LABEL,
  resolveSectionMaxTokens,
  resolveSectionTimeoutMs,
  resolveDeriveNumCtx,
};
