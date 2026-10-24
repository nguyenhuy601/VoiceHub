/**
 * Phase WHAT — FR Decompose contract (Epic → Story SoT for HOW/WBS).
 * Flag: WHAT_FR_DECOMPOSE (default on).
 */

const { QWEN_PLUS_MAX_OUTPUT_TOKENS } = require('@enterprise/shared/llm/openaiCompatibleClient');
const { modelOutputCeiling, rowsPerOutputCall } = require('../runtime/modelOutputBudget');

/** Reserved completion tokens for one story row. */
const FR_DECOMPOSE_TOKENS_PER_STORY = 120;

const FR_DECOMPOSE_SHAPE_VERSION = 'fr-decompose-v1';

const FR_DECOMPOSE_MAX_FR = 48;
const FR_DECOMPOSE_MAX_EPICS = 24;
const FR_DECOMPOSE_MAX_STORIES = 80;
const FR_DECOMPOSE_MAX_AC_PER_STORY = 24;
const FR_DECOMPOSE_DEFAULT_TIMEOUT_MS = 180000;
const FR_DECOMPOSE_DEFAULT_NUM_PREDICT = QWEN_PLUS_MAX_OUTPUT_TOKENS;
const FR_DECOMPOSE_DEFAULT_CHUNK = FR_DECOMPOSE_MAX_FR;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isWhatFrDecomposeFlagOn(env = process.env) {
  const raw = env.WHAT_FR_DECOMPOSE;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return true; // default on when shipping
  }
  const s = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return true;
}

function clampInt(raw, fallback, { min, max }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function resolveFrDecomposeMaxFr(env = process.env) {
  return clampInt(env.WHAT_FR_DECOMPOSE_MAX_FR, FR_DECOMPOSE_MAX_FR, {
    min: 1,
    max: 80,
  });
}

function resolveFrDecomposeNumCtx(env = process.env) {
  const n = Number(env.WHAT_FR_DECOMPOSE_NUM_CTX);
  if (!Number.isFinite(n)) return undefined;
  return clampInt(n, n, { min: 1024, max: 131072 });
}

function resolveFrDecomposeTimeoutMs(env = process.env) {
  return clampInt(
    env.WHAT_FR_DECOMPOSE_TIMEOUT_MS,
    FR_DECOMPOSE_DEFAULT_TIMEOUT_MS,
    { min: 15000, max: 600000 }
  );
}

function resolveFrDecomposeChunk(env = process.env) {
  const requested = clampInt(env.WHAT_FR_DECOMPOSE_CHUNK, FR_DECOMPOSE_DEFAULT_CHUNK, {
    min: 1,
    max: 80,
  });
  return Math.min(requested, rowsPerOutputCall(FR_DECOMPOSE_TOKENS_PER_STORY, env));
}

function resolveFrDecomposeNumPredict(env = process.env) {
  const ceiling = Math.min(QWEN_PLUS_MAX_OUTPUT_TOKENS, modelOutputCeiling(env));
  return clampInt(env.WHAT_FR_DECOMPOSE_NUM_PREDICT, ceiling, { min: 128, max: ceiling });
}

module.exports = {
  FR_DECOMPOSE_SHAPE_VERSION,
  FR_DECOMPOSE_MAX_FR,
  FR_DECOMPOSE_MAX_EPICS,
  FR_DECOMPOSE_MAX_STORIES,
  FR_DECOMPOSE_MAX_AC_PER_STORY,
  FR_DECOMPOSE_DEFAULT_TIMEOUT_MS,
  FR_DECOMPOSE_DEFAULT_NUM_PREDICT,
  FR_DECOMPOSE_DEFAULT_CHUNK,
  isWhatFrDecomposeFlagOn,
  resolveFrDecomposeMaxFr,
  resolveFrDecomposeNumCtx,
  resolveFrDecomposeTimeoutMs,
  resolveFrDecomposeNumPredict,
  resolveFrDecomposeChunk,
};
