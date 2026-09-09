/**
 * AI Analysis Compact V2 — flag, budgets, content hash, FR coverage gate.
 * Tuned for qwen2.5:3b on ~8GB (serial LLM, no parallel chunks).
 */

const crypto = require('crypto');
const {
  buildRequirementFrSlices,
  buildRequirementFrSlicesForAnalysis,
  buildProjectContextSlice,
} = require('./aiAnalysisFrSlice');
const { hasAmbiguousLanguage } = require('./aiAnalysisLocaleText');
const { resolveCompactJobWallMs } = require('./aiAnalysisJobBudgets');

/** Bump when compact prompt schemas change (invalidates LLM cache). */
const PROMPT_VERSION = 'compact-v2.2';

const DEFAULT_NUM_PREDICT = 384;
const DEFAULT_CALL_TIMEOUT_MS = 60000;
const DEFAULT_JOB_WALL_MS = 120000;
const DEFAULT_HOT_FR_MAX = 40;
const DEFAULT_GAP_FLAG_MIN_FOR_LLM = 3;
const DEFAULT_NUM_CTX = 4096;
const DEFAULT_SESSION_WARM_TTL_MS = 25 * 60 * 1000;

function parseBoolEnv(raw, defaultOn = false) {
  if (raw == null || String(raw).trim() === '') return defaultOn;
  const v = String(raw).trim().toLowerCase();
  if (['1', 'true', 'on', 'yes'].includes(v)) return true;
  if (['0', 'false', 'off', 'no'].includes(v)) return false;
  return defaultOn;
}

function clampInt(raw, fallback, { min = 1, max = 1_000_000 } = {}) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

/** Feature flag — default off until smoke pass. */
function isCompactV2Enabled() {
  return parseBoolEnv(process.env.AI_ANALYSIS_COMPACT_V2, false);
}

function compactNumPredict() {
  return clampInt(process.env.AI_ANALYSIS_COMPACT_NUM_PREDICT, DEFAULT_NUM_PREDICT, {
    min: 64,
    max: 768,
  });
}

function compactCallTimeoutMs() {
  return clampInt(
    process.env.AI_ANALYSIS_COMPACT_CALL_TIMEOUT_MS ??
      process.env.OLLAMA_ANALYSIS_CHUNK_TIMEOUT_MS,
    DEFAULT_CALL_TIMEOUT_MS,
    { min: 10_000, max: 180_000 }
  );
}

function compactJobWallMs(job = 'requirementAnalysis') {
  return resolveCompactJobWallMs(job);
}

function compactHotFrMax() {
  return clampInt(process.env.AI_ANALYSIS_COMPACT_HOT_FR_MAX, DEFAULT_HOT_FR_MAX, {
    min: 8,
    max: 80,
  });
}

function compactGapFlagMinForLlm() {
  return clampInt(
    process.env.AI_ANALYSIS_COMPACT_GAP_FLAG_MIN,
    DEFAULT_GAP_FLAG_MIN_FOR_LLM,
    { min: 0, max: 50 }
  );
}

function compactNumCtx() {
  return clampInt(process.env.OLLAMA_NUM_CTX, DEFAULT_NUM_CTX, {
    min: 2048,
    max: 8192,
  });
}

function compactSessionWarmTtlMs() {
  return clampInt(
    process.env.AI_ANALYSIS_COMPACT_WARM_TTL_MS,
    DEFAULT_SESSION_WARM_TTL_MS,
    { min: 60_000, max: 120 * 60 * 1000 }
  );
}

/**
 * Stable hash of pack inputs that affect LLM prompts (FR + overview).
 * Optional hierarchy includes accepted/pending proposed Requirements for Job1 union.
 * @param {object} pack
 * @param {{ hierarchy?: object }} [opts]
 * @returns {string}
 */
function buildPackContentHash(pack, { hierarchy } = {}) {
  const slices = hierarchy
    ? buildRequirementFrSlicesForAnalysis(pack, hierarchy, { maxItems: 200 })
    : buildRequirementFrSlices(pack, { maxItems: 200 });
  const context = buildProjectContextSlice(pack);
  const payload = {
    v: 1,
    context,
    fr: slices.map((s) => ({
      id: s.id,
      m: s.module,
      f: s.feature || '',
      t: s.title,
      d: s.description || '',
      a: s.ac || '',
      src: s.source || '',
    })),
  };
  return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 32);
}

/**
 * Score FR for "hot" coverage (short/ambiguous content first, then long modules).
 * @param {{ id: string, module?: string, title?: string, description?: string, ac?: string }} slice
 */
function scoreHotFr(slice) {
  let score = 0;
  const desc = String(slice.description || '');
  const ac = String(slice.ac || '');
  if (desc.length < 20) score += 40;
  if (ac.length < 15) score += 40;
  if (desc.length > 120) score += 15;
  if (ac.length > 80) score += 10;
  const blob = `${slice.title || ''} ${desc} ${ac}`;
  if (hasAmbiguousLanguage(blob)) score += 25;
  score += Math.min(20, String(slice.module || '').length / 4);
  return score;
}

/**
 * Pick FR slices to send to LLM (coverage gate). Rest stay heuristic-only.
 * @param {object[]} frSlices
 * @param {{ maxHot?: number }} [opts]
 */
function selectHotFrSlices(frSlices = [], opts = {}) {
  const maxHot = opts.maxHot ?? compactHotFrMax();
  const ranked = [...frSlices]
    .map((s) => ({ slice: s, score: scoreHotFr(s) }))
    .sort((a, b) => b.score - a.score || String(a.slice.id).localeCompare(String(b.slice.id)));
  return ranked.slice(0, maxHot).map((r) => r.slice);
}

/**
 * Quality flags for gap gate (same signals as gap hints, compact).
 * @param {object[]} frSlices
 */
function buildQualityFlags(frSlices = []) {
  const qualityFlags = [];
  for (const slice of frSlices) {
    const flags = [];
    if (!slice.description || String(slice.description).length < 20) {
      flags.push('desc_short_or_empty');
    }
    if (!slice.ac || String(slice.ac).length < 15) flags.push('ac_short_or_empty');
    const blob = `${slice.title || ''} ${slice.description || ''} ${slice.ac || ''}`;
    if (hasAmbiguousLanguage(blob)) {
      flags.push('ambiguous_language');
    }
    if (flags.length) {
      qualityFlags.push({ id: slice.id, module: slice.module, title: slice.title, flags });
    }
  }
  return qualityFlags;
}

function shouldRunGapLlm(qualityFlags = [], opts = {}) {
  const min = opts.minFlags ?? compactGapFlagMinForLlm();
  return (qualityFlags || []).length >= min;
}

function compactGenerateOpts(overrides = {}) {
  return {
    timeoutMs: compactCallTimeoutMs(),
    numPredict: compactNumPredict(),
    numCtx: compactNumCtx(),
    temperature: 0.1,
    ...overrides,
  };
}

module.exports = {
  PROMPT_VERSION,
  DEFAULT_NUM_PREDICT,
  DEFAULT_CALL_TIMEOUT_MS,
  DEFAULT_JOB_WALL_MS,
  DEFAULT_HOT_FR_MAX,
  DEFAULT_GAP_FLAG_MIN_FOR_LLM,
  DEFAULT_NUM_CTX,
  DEFAULT_SESSION_WARM_TTL_MS,
  isCompactV2Enabled,
  compactNumPredict,
  compactCallTimeoutMs,
  compactJobWallMs,
  compactHotFrMax,
  compactGapFlagMinForLlm,
  compactNumCtx,
  compactSessionWarmTtlMs,
  buildPackContentHash,
  scoreHotFr,
  selectHotFrSlices,
  buildQualityFlags,
  shouldRunGapLlm,
  compactGenerateOpts,
  parseBoolEnv,
};
