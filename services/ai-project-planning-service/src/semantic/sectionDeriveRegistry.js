/**
 * Per-section derive config — same pipeline as BG, section-specific input/output.
 * Unlock order via PHASE1_RAW_DERIVE_SECTIONS (comma list).
 *
 * Wave-1: interface removed; nfr + scope added to LLM catalog.
 */

const { QWEN_PLUS_MAX_OUTPUT_TOKENS } = require('@enterprise/shared/llm/openaiCompatibleClient');
const { modelOutputCeiling } = require('../runtime/modelOutputBudget');

const LLM_DERIVE_ORDER = Object.freeze([
  'bg',
  'br',
  'fr',
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
  fr: 'functionalRequirements',
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
  fr: 'items',
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
  fr: ['functionalRequirements', 'requirements'],
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
  fr: 'FR',
  bpm: 'BPM',
  uc: 'UC',
  data: 'ENT',
  nfr: 'NFR',
  scope: 'SC',
  actors: 'ACT',
});

/** Per-section completion cap. Default is the qwen-plus output window. */
const DEFAULT_MAX_TOKENS = Object.freeze({
  bg: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  br: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  fr: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  uc: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  bpm: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  data: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  nfr: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  scope: QWEN_PLUS_MAX_OUTPUT_TOKENS,
  actors: QWEN_PLUS_MAX_OUTPUT_TOKENS,
});

/** Label "Fr" → toolName WhatFrTool (matches WHAT_FR_TOOL). */
const SECTION_LABEL = Object.freeze({
  bg: 'BG',
  br: 'BR',
  fr: 'Fr',
  bpm: 'BPM',
  uc: 'UC',
  data: 'Data',
  nfr: 'NFR',
  scope: 'Scope',
  actors: 'Actors',
});

function resolveSectionMaxTokens(engineId, env = process.env) {
  const ceiling = modelOutputCeiling(env);
  const id = String(engineId || '').toLowerCase();
  const envKey = `PHASE1_${id.toUpperCase()}_DERIVE_MAX_TOKENS`;
  const n = Number(env[envKey]);
  if (Number.isFinite(n) && n >= 128) {
    return Math.min(ceiling, Math.floor(n));
  }
  if (id === 'bg') {
    const legacy = Number(env.PHASE1_BG_DERIVE_MAX_TOKENS);
    if (Number.isFinite(legacy) && legacy >= 128) {
      return Math.min(ceiling, Math.floor(legacy));
    }
  }
  return Math.min(ceiling, DEFAULT_MAX_TOKENS[id] || QWEN_PLUS_MAX_OUTPUT_TOKENS);
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

/** Ollama-only. Unset means the chat model window (DashScope ignores num_ctx). */
function resolveDeriveNumCtx(env = process.env) {
  const n = Number(env.PHASE1_DERIVE_NUM_CTX);
  if (Number.isFinite(n) && n >= 1024) return Math.min(131072, Math.floor(n));
  return undefined;
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
