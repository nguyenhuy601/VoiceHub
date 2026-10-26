/**
 * FR understanding policy — timeouts and batch size.
 * Prefer AI_FR_* env; AI_G4_* remains deprecated fallback.
 * Output ceiling is the qwen-plus window, not a local decode budget.
 */

const { QWEN_PLUS_MAX_OUTPUT_TOKENS } = require('@enterprise/shared/llm/openaiCompatibleClient');
const { modelOutputCeiling } = require('../runtime/modelOutputBudget');

function envFlag(raw, defaultOn = true) {
  if (raw == null || String(raw).trim() === '') return defaultOn;
  const v = String(raw).trim().toLowerCase();
  return !['0', 'false', 'off', 'no'].includes(v);
}

function clampInt(raw, fallback, { min = 1, max = 1_000_000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

/** Prefer FR key; fall back to deprecated G4 key when FR unset. */
function envPref(env, frKey, g4Key) {
  const fr = env[frKey];
  if (fr != null && String(fr).trim() !== '') return fr;
  const g4 = env[g4Key];
  if (g4 != null && String(g4).trim() !== '') return g4;
  return undefined;
}

function readTask(env, frPrefix, g4Prefix, defaults) {
  return {
    enabled: envFlag(
      envPref(env, `${frPrefix}_ENABLED`, `${g4Prefix}_ENABLED`),
      defaults.enabled
    ),
    timeoutMs: clampInt(
      envPref(env, `${frPrefix}_TIMEOUT_MS`, `${g4Prefix}_TIMEOUT_MS`),
      defaults.timeoutMs,
      { min: 5000, max: 600000 }
    ),
    maxInputTokens: clampInt(
      envPref(env, `${frPrefix}_MAX_INPUT_TOKENS`, `${g4Prefix}_MAX_INPUT_TOKENS`),
      defaults.maxInputTokens,
      { min: 256, max: 131072 }
    ),
    maxOutputTokens: clampInt(
      envPref(env, `${frPrefix}_MAX_OUTPUT_TOKENS`, `${g4Prefix}_MAX_OUTPUT_TOKENS`),
      defaults.maxOutputTokens,
      { min: 64, max: defaults.maxOutputTokens }
    ),
    numCtx: clampInt(
      envPref(env, `${frPrefix}_NUM_CTX`, `${g4Prefix}_NUM_CTX`),
      defaults.numCtx,
      { min: 512, max: 131072 }
    ),
    maxCalls: clampInt(
      envPref(env, `${frPrefix}_MAX_CALLS`, `${g4Prefix}_MAX_CALLS`),
      defaults.maxCalls,
      { min: 0, max: 64 }
    ),
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveFrPolicy(env = process.env) {
  const outputCeiling = Math.min(QWEN_PLUS_MAX_OUTPUT_TOKENS, modelOutputCeiling(env));
  return {
    input: {
      maxFr: clampInt(envPref(env, 'AI_FR_MAX_FR', 'AI_G4_MAX_FR'), 200, {
        min: 1,
        max: 2000,
      }),
    },
    preAnalysis: {
      enabled: envFlag(envPref(env, 'AI_FR_PRE_ANALYSIS', 'AI_G4_PRE_ANALYSIS'), true),
    },
    candidateSelection: {
      enabled: envFlag(
        envPref(env, 'AI_FR_CANDIDATE_SELECTION', 'AI_G4_CANDIDATE_SELECTION'),
        true
      ),
    },
    llm: {
      semanticProjection: readTask(env, 'AI_FR_SEMANTIC', 'AI_G4_SEMANTIC', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 16,
      }),
      conflictAnalysis: readTask(env, 'AI_FR_CONFLICT', 'AI_G4_CONFLICT', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 8,
      }),
      synthesis: readTask(env, 'AI_FR_SYNTHESIS', 'AI_G4_SYNTHESIS', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 4,
      }),
    },
    failure: {
      continueOnTimeout: envFlag(
        envPref(env, 'AI_FR_CONTINUE_ON_TIMEOUT', 'AI_G4_CONTINUE_ON_TIMEOUT'),
        true
      ),
      continueOnParseError: envFlag(
        envPref(env, 'AI_FR_CONTINUE_ON_PARSE_ERROR', 'AI_G4_CONTINUE_ON_PARSE_ERROR'),
        true
      ),
    },
    evidence: {
      required: envFlag(envPref(env, 'AI_FR_EVIDENCE_REQUIRED', 'AI_G4_EVIDENCE_REQUIRED'), true),
    },
  };
}

/** @deprecated Use resolveFrPolicy */
const resolveAiG4Policy = resolveFrPolicy;

module.exports = {
  resolveFrPolicy,
  resolveAiG4Policy,
  clampInt,
  envFlag,
  envPref,
};
