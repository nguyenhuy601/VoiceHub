/**
 * AI_G4 policy — timeouts, token budgets, max calls (Wave 4).
 * Env prefix AI_G4_* overrides defaults.
 */

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

function readTask(env, prefix, defaults) {
  return {
    enabled: envFlag(env[`${prefix}_ENABLED`], defaults.enabled),
    timeoutMs: clampInt(env[`${prefix}_TIMEOUT_MS`], defaults.timeoutMs, {
      min: 5000,
      max: 600000,
    }),
    maxInputTokens: clampInt(env[`${prefix}_MAX_INPUT_TOKENS`], defaults.maxInputTokens, {
      min: 256,
      max: 32000,
    }),
    maxOutputTokens: clampInt(env[`${prefix}_MAX_OUTPUT_TOKENS`], defaults.maxOutputTokens, {
      min: 64,
      max: 4096,
    }),
    numCtx: clampInt(env[`${prefix}_NUM_CTX`], defaults.numCtx, {
      min: 512,
      max: 32768,
    }),
    maxCalls: clampInt(env[`${prefix}_MAX_CALLS`], defaults.maxCalls, {
      min: 0,
      max: 20,
    }),
  };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
function resolveAiG4Policy(env = process.env) {
  const pipelineEnabled = envFlag(env.AI_G4_PIPELINE, true);
  return {
    pipelineEnabled,
    input: {
      maxFr: clampInt(env.AI_G4_MAX_FR, 200, { min: 1, max: 2000 }),
    },
    preAnalysis: {
      enabled: envFlag(env.AI_G4_PRE_ANALYSIS, true),
    },
    candidateSelection: {
      enabled: envFlag(env.AI_G4_CANDIDATE_SELECTION, true),
    },
    llm: {
      semanticProjection: readTask(env, 'AI_G4_SEMANTIC', {
        enabled: true,
        timeoutMs: 45_000,
        maxInputTokens: 1400,
        maxOutputTokens: 256,
        numCtx: 4096,
        maxCalls: 1,
      }),
      conflictAnalysis: readTask(env, 'AI_G4_CONFLICT', {
        enabled: true,
        timeoutMs: 45_000,
        maxInputTokens: 2800,
        maxOutputTokens: 384,
        numCtx: 4096,
        maxCalls: 2,
      }),
      synthesis: readTask(env, 'AI_G4_SYNTHESIS', {
        enabled: true,
        timeoutMs: 45_000,
        maxInputTokens: 2000,
        maxOutputTokens: 384,
        numCtx: 4096,
        maxCalls: 1,
      }),
    },
    failure: {
      continueOnTimeout: envFlag(env.AI_G4_CONTINUE_ON_TIMEOUT, true),
      continueOnParseError: envFlag(env.AI_G4_CONTINUE_ON_PARSE_ERROR, true),
    },
    evidence: {
      required: envFlag(env.AI_G4_EVIDENCE_REQUIRED, true),
    },
  };
}

module.exports = {
  resolveAiG4Policy,
  clampInt,
  envFlag,
};
