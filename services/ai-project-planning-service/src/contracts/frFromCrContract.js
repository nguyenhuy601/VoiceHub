/**
 * Phase WHAT — propose analyzed FR-* from Customer Raw CR intake.
 * Flag: WHAT_FR_FROM_CR (default on). Customer Raw path only.
 */

const { QWEN_PLUS_MAX_OUTPUT_TOKENS } = require('@enterprise/shared/llm/openaiCompatibleClient');
const { modelOutputCeiling, rowsPerOutputCall } = require('../runtime/modelOutputBudget');

/** Reserved completion tokens for one proposed FR node. */
const FR_FROM_CR_TOKENS_PER_FR = 160;

const FR_FROM_CR_SHAPE_VERSION = 'fr-from-cr-v1';
const FR_FROM_CR_MAX_CR = 80;
const FR_FROM_CR_CHUNK = FR_FROM_CR_MAX_CR;
const FR_FROM_CR_DEFAULT_TIMEOUT_MS = 180000;
const FR_FROM_CR_DEFAULT_NUM_PREDICT = QWEN_PLUS_MAX_OUTPUT_TOKENS;

function isWhatFrFromCrFlagOn(env = process.env) {
  const raw = env.WHAT_FR_FROM_CR;
  if (raw === undefined || raw === null || String(raw).trim() === '') return true;
  const s = String(raw).trim().toLowerCase();
  if (['0', 'false', 'off', 'no'].includes(s)) return false;
  return true;
}

function clampInt(raw, fallback, { min, max }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function resolveFrFromCrChunk(env = process.env) {
  const requested = clampInt(env.WHAT_FR_FROM_CR_CHUNK, FR_FROM_CR_CHUNK, { min: 1, max: 120 });
  return Math.min(requested, rowsPerOutputCall(FR_FROM_CR_TOKENS_PER_FR, env));
}

function resolveFrFromCrMaxCr(env = process.env) {
  return clampInt(env.WHAT_FR_FROM_CR_MAX_CR, FR_FROM_CR_MAX_CR, { min: 1, max: 120 });
}

function resolveFrFromCrNumCtx(env = process.env) {
  const n = Number(env.WHAT_FR_FROM_CR_NUM_CTX);
  if (!Number.isFinite(n)) return undefined;
  return clampInt(n, n, { min: 1024, max: 131072 });
}

function resolveFrFromCrTimeoutMs(env = process.env) {
  return clampInt(env.WHAT_FR_FROM_CR_TIMEOUT_MS, FR_FROM_CR_DEFAULT_TIMEOUT_MS, {
    min: 15000,
    max: 600000,
  });
}

function resolveFrFromCrNumPredict(env = process.env) {
  const ceiling = Math.min(QWEN_PLUS_MAX_OUTPUT_TOKENS, modelOutputCeiling(env));
  return clampInt(env.WHAT_FR_FROM_CR_NUM_PREDICT, ceiling, {
    min: 128,
    max: ceiling,
  });
}

module.exports = {
  FR_FROM_CR_SHAPE_VERSION,
  isWhatFrFromCrFlagOn,
  resolveFrFromCrChunk,
  resolveFrFromCrMaxCr,
  resolveFrFromCrNumCtx,
  resolveFrFromCrTimeoutMs,
  resolveFrFromCrNumPredict,
};
