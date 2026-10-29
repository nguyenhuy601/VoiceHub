/**
 * FR understanding policy — timeouts and batch size.
 * Uses AI_FR_* env only (hard cut — no legacy requirement-policy fallback keys).
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

function envVal(env, key) {
  const raw = env[key];
  if (raw != null && String(raw).trim() !== '') return raw;
  return undefined;
}

function readTask(env, prefix, defaults) {
  return {
    enabled: envFlag(envVal(env, `${prefix}_ENABLED`), defaults.enabled),
    timeoutMs: clampInt(envVal(env, `${prefix}_TIMEOUT_MS`), defaults.timeoutMs, {
      min: 5000,
      max: 600000,
    }),
    maxInputTokens: clampInt(
      envVal(env, `${prefix}_MAX_INPUT_TOKENS`),
      defaults.maxInputTokens,
      { min: 256, max: 131072 }
    ),
    maxOutputTokens: clampInt(
      envVal(env, `${prefix}_MAX_OUTPUT_TOKENS`),
      defaults.maxOutputTokens,
      { min: 64, max: defaults.maxOutputTokens }
    ),
    numCtx: clampInt(envVal(env, `${prefix}_NUM_CTX`), defaults.numCtx, {
      min: 512,
      max: 131072,
    }),
    maxCalls: clampInt(envVal(env, `${prefix}_MAX_CALLS`), defaults.maxCalls, {
      min: 0,
      max: 64,
    }),
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveFrPolicy(env = process.env) {
  const outputCeiling = Math.min(QWEN_PLUS_MAX_OUTPUT_TOKENS, modelOutputCeiling(env));
  return {
    input: {
      maxFr: clampInt(envVal(env, 'AI_FR_MAX_FR'), 200, {
        min: 1,
        max: 2000,
      }),
    },
    preAnalysis: {
      enabled: envFlag(envVal(env, 'AI_FR_PRE_ANALYSIS'), true),
    },
    candidateSelection: {
      enabled: envFlag(envVal(env, 'AI_FR_CANDIDATE_SELECTION'), true),
    },
    llm: {
      semanticProjection: readTask(env, 'AI_FR_SEMANTIC', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 16,
      }),
      conflictAnalysis: readTask(env, 'AI_FR_CONFLICT', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 8,
      }),
      synthesis: readTask(env, 'AI_FR_SYNTHESIS', {
        enabled: true,
        timeoutMs: 180_000,
        maxInputTokens: 32768,
        maxOutputTokens: outputCeiling,
        numCtx: 32768,
        maxCalls: 4,
      }),
    },
    failure: {
      continueOnTimeout: envFlag(envVal(env, 'AI_FR_CONTINUE_ON_TIMEOUT'), true),
      continueOnParseError: envFlag(envVal(env, 'AI_FR_CONTINUE_ON_PARSE_ERROR'), true),
    },
    evidence: {
      required: envFlag(envVal(env, 'AI_FR_EVIDENCE_REQUIRED'), true),
    },
  };
}

module.exports = {
  resolveFrPolicy,
  clampInt,
  envFlag,
  envVal,
};
