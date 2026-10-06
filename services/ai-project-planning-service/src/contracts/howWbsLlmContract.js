/**
 * Wave L — HOW WBS LLM contract (Step 0).
 * XOR with hierarchy heuristic; default OFF (HARD-02).
 */

const HOW_WBS_LLM_SHAPE_VERSION = 'how-wbs-llm-v2';
const WBS_LLM_LEVELS = Object.freeze(['epic', 'feature', 'story', 'task']);
const WBS_LLM_MAX_NODES = 200;
/** Compact prompt defaults (latency) — override via env HOW_WBS_LLM_* */
const WBS_LLM_MAX_AC_PER_FR = 2;
const WBS_LLM_AC_TRUNCATE = 40;
/** Max work leaves per FR (multi-task decompose). Override: HOW_WBS_LLM_MAX_LEAVES_PER_FR */
const WBS_LLM_MAX_LEAVES_PER_FR = 4;
/** Soft target in prompt — keep ≤2 for CPU 3B decode budget */
const WBS_LLM_TARGET_LEAVES_PER_FR = 2;
const WBS_LLM_MAX_FR = 48;
const WBS_LLM_MAX_CAPS = 12;
const WBS_LLM_DEFAULT_NUM_CTX = 1536;
/** Align with OLLAMA_PLANNING_TIMEOUT_MS — multi-leaf needs >120s on CPU 3B */
const WBS_LLM_DEFAULT_TIMEOUT_MS = 240000;
/** Small chunks: multi-leaf JSON decode is the bottleneck */
const WBS_LLM_MAX_FR_FOR_CALL = 3;
/** Cap chunk count (45 FR / 3 ≈ 15) */
const WBS_LLM_MAX_CHUNKS = 16;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isHowWbsLlmFlagOn(env = process.env) {
  const flag = String(env.HOW_WBS_LLM ?? '0').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(flag);
}

function clampInt(raw, fallback, { min, max }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function resolveWbsLlmMaxLeavesPerFr(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_LEAVES_PER_FR, WBS_LLM_MAX_LEAVES_PER_FR, {
    min: 1,
    max: 8,
  });
}

/**
 * Decode budget is the wall-clock killer on CPU 3B (~7–8 tok/s).
 * Multi-leaf/FR: size predict to chunk FR count × target leaves.
 */
function resolveWbsLlmNumPredict(frCount, env = process.env) {
  const override = Number(env.HOW_WBS_LLM_NUM_PREDICT);
  if (Number.isFinite(override) && override >= 64) {
    return clampInt(override, 320, { min: 64, max: 1024 });
  }
  const fr = Math.max(1, Number(frCount) || 1);
  const leaves = Math.min(
    resolveWbsLlmMaxLeavesPerFr(env),
    WBS_LLM_TARGET_LEAVES_PER_FR
  );
  // ~40 tok/leaf + envelope; stay under ~55s decode @ 7 tok/s when possible
  const estimated = 80 + fr * leaves * 40;
  return clampInt(estimated, 280, { min: 160, max: 512 });
}

function resolveWbsLlmNumCtx(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_NUM_CTX, WBS_LLM_DEFAULT_NUM_CTX, {
    min: 1024,
    max: 8192,
  });
}

function resolveWbsLlmTimeoutMs(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_TIMEOUT_MS, WBS_LLM_DEFAULT_TIMEOUT_MS, {
    min: 15000,
    max: 600000,
  });
}

function resolveWbsLlmMaxFr(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_FR, WBS_LLM_MAX_FR, { min: 1, max: 80 });
}

function resolveWbsLlmMaxCaps(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_CAPS, WBS_LLM_MAX_CAPS, { min: 1, max: 80 });
}

/** Max FR per single LLM call (chunk size for large packs). */
function resolveWbsLlmMaxFrForCall(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_FR_FOR_CALL, WBS_LLM_MAX_FR_FOR_CALL, {
    min: 1,
    max: 40,
  });
}

function resolveWbsLlmMaxChunks(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_CHUNKS, WBS_LLM_MAX_CHUNKS, {
    min: 1,
    max: 24,
  });
}

/**
 * True when LLM WBS flag on and pack has ≥1 FR (large packs use chunked LLM).
 * @param {object} pack
 * @param {NodeJS.ProcessEnv} [env]
 */
function shouldAttemptWbsLlm(pack, env = process.env) {
  if (!isHowWbsLlmFlagOn(env)) return false;
  const rows = Array.isArray(pack?.functionalRequirements)
    ? pack.functionalRequirements
    : Array.isArray(pack?.frList)
      ? pack.frList
      : Array.isArray(pack?.requirements)
        ? pack.requirements
        : [];
  return rows.length > 0;
}

module.exports = {
  HOW_WBS_LLM_SHAPE_VERSION,
  WBS_LLM_LEVELS,
  WBS_LLM_MAX_NODES,
  WBS_LLM_MAX_AC_PER_FR,
  WBS_LLM_AC_TRUNCATE,
  WBS_LLM_MAX_LEAVES_PER_FR,
  WBS_LLM_TARGET_LEAVES_PER_FR,
  WBS_LLM_MAX_FR,
  WBS_LLM_MAX_CAPS,
  WBS_LLM_DEFAULT_NUM_CTX,
  WBS_LLM_DEFAULT_TIMEOUT_MS,
  WBS_LLM_MAX_FR_FOR_CALL,
  WBS_LLM_MAX_CHUNKS,
  isHowWbsLlmFlagOn,
  resolveWbsLlmMaxLeavesPerFr,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  resolveWbsLlmMaxFr,
  resolveWbsLlmMaxCaps,
  resolveWbsLlmMaxFrForCall,
  resolveWbsLlmMaxChunks,
  shouldAttemptWbsLlm,
};
