/**
 * Wave L — HOW WBS LLM contract (Step 0).
 * XOR with hierarchy heuristic; flag via HOW_WBS_LLM or HOW_SEMANTIC_LLM master.
 * Fail → hierarchy fallback (HARD-02).
 */

const HOW_WBS_LLM_SHAPE_VERSION = 'how-wbs-llm-v3';
/** Epic → Feature → Story → Work Package → Task */
const WBS_LLM_LEVELS = Object.freeze([
  'epic',
  'feature',
  'story',
  'work_package',
  'task',
]);
const WBS_LLM_MAX_NODES = 200;
/** Prompt defaults — override via env HOW_WBS_LLM_*. AC kept long enough to cite. */
const WBS_LLM_MAX_AC_PER_FR = 6;
const WBS_LLM_AC_TRUNCATE = 160;
/** Max work leaves per FR (multi-task decompose). Override: HOW_WBS_LLM_MAX_LEAVES_PER_FR */
const WBS_LLM_MAX_LEAVES_PER_FR = 4;
/** Soft target in the legacy decompose prompt. Output budget uses max leaves, not this hint. */
const WBS_LLM_TARGET_LEAVES_PER_FR = 2;
const WBS_LLM_MAX_FR = 48;
const WBS_LLM_MAX_CAPS = 12;
const WBS_LLM_DEFAULT_TIMEOUT_MS = 240000;
/** qwen-plus max output on DashScope. One WBS call may use this whole budget. */
const WBS_LLM_MAX_OUTPUT_TOKENS = 32768;
/** One task JSON in Vietnamese is ~90–150 tokens. 40 truncates a full leaf. */
const WBS_LLM_TOKENS_PER_LEAF = 160;
const WBS_LLM_PREDICT_ENVELOPE = 80;
/** Cap chunk count so a huge pack still fans out. */
const WBS_LLM_MAX_CHUNKS = 16;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isHowWbsLlmFlagOn(env = process.env) {
  // HOW_WBS_LLM override, else HOW_SEMANTIC_LLM master (see howSemanticLlmFlags).
  const { isHowSemanticSectionLlmOn } = require('../config/howSemanticLlmFlags');
  return isHowSemanticSectionLlmOn('wbs', env);
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

function resolveWbsLlmMaxOutputTokens(env = process.env) {
  const { resolveChatMaxOutputTokens } = require('@enterprise/shared/llm/openaiCompatibleClient');
  const ceiling = Math.min(WBS_LLM_MAX_OUTPUT_TOKENS, resolveChatMaxOutputTokens(env));
  return clampInt(env.HOW_WBS_LLM_MAX_OUTPUT_TOKENS, ceiling, {
    min: 256,
    max: ceiling,
  });
}

/** FR rows whose task JSON fits in one qwen-plus completion. */
function resolveWbsFrPerCall(env = process.env) {
  const maxOut = resolveWbsLlmMaxOutputTokens(env);
  const leaves = resolveWbsLlmMaxLeavesPerFr(env);
  const perFr = Math.max(1, leaves * WBS_LLM_TOKENS_PER_LEAF);
  const fit = Math.max(1, Math.floor((maxOut - WBS_LLM_PREDICT_ENVELOPE) / perFr));
  const explicit = Number(env.HOW_WBS_UNIT_CHUNK);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.max(1, Math.min(fit, Math.round(explicit)));
  }
  return fit;
}

/**
 * Completion budget for one WBS slice. Scales with FR × max leaves.
 * HOW_WBS_LLM_NUM_PREDICT, when set, replaces the formula up to qwen-plus max output.
 */
function resolveWbsLlmNumPredict(frCount, env = process.env) {
  const maxOut = resolveWbsLlmMaxOutputTokens(env);
  const override = Number(env.HOW_WBS_LLM_NUM_PREDICT);
  if (Number.isFinite(override) && override >= 64) {
    return clampInt(override, override, { min: 64, max: maxOut });
  }
  const fr = Math.max(1, Number(frCount) || 1);
  const leaves = resolveWbsLlmMaxLeavesPerFr(env);
  const estimated = WBS_LLM_PREDICT_ENVELOPE + fr * leaves * WBS_LLM_TOKENS_PER_LEAF;
  return clampInt(estimated, estimated, { min: 160, max: maxOut });
}

function resolveWbsLlmNumCtx(env = process.env) {
  const n = Number(env.HOW_WBS_LLM_NUM_CTX);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(1024, Math.min(131072, Math.round(n)));
}

function resolveWbsLlmTimeoutMs(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_TIMEOUT_MS, WBS_LLM_DEFAULT_TIMEOUT_MS, {
    min: 15000,
    max: 600000,
  });
}

function resolveWbsLlmMaxFr(env = process.env) {
  const fit = resolveWbsFrPerCall({ ...env, HOW_WBS_UNIT_CHUNK: undefined });
  const explicit = Number(env.HOW_WBS_LLM_MAX_FR);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.max(1, Math.min(fit, Math.round(explicit)));
  }
  return fit;
}

function resolveWbsLlmMaxCaps(env = process.env) {
  return clampInt(env.HOW_WBS_LLM_MAX_CAPS, WBS_LLM_MAX_CAPS, { min: 1, max: 80 });
}

/** Max FR per single LLM call. Default is the qwen-plus output fit. */
function resolveWbsLlmMaxFrForCall(env = process.env) {
  const fit = resolveWbsFrPerCall({ ...env, HOW_WBS_UNIT_CHUNK: undefined });
  const explicit = Number(env.HOW_WBS_LLM_MAX_FR_FOR_CALL);
  if (Number.isFinite(explicit) && explicit >= 1) {
    return Math.max(1, Math.min(fit, Math.round(explicit)));
  }
  return fit;
}

function storyGroupKey(unit) {
  const storyId = String(unit?.storyId || '').trim();
  if (storyId) return `story:${storyId}`;
  return `fr:${String(unit?.id || '').trim()}`;
}

/**
 * One LLM call is a run of whole stories that fit the output window.
 * HOW_WBS_UNIT_CHUNK still forces a fixed FR count for tests and operators.
 * A story is never split across calls. A story that alone exceeds the window
 * stays one call; numPredict clamps to the model max.
 * @param {object[]} frUnits
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {object[][]}
 */
function planWbsCallSlices(frUnits, env = process.env) {
  const units = Array.isArray(frUnits) ? frUnits.filter((unit) => unit?.id) : [];
  const explicit = Number(env.HOW_WBS_UNIT_CHUNK);
  if (Number.isFinite(explicit) && explicit >= 1) {
    const size = Math.max(1, Math.round(explicit));
    const slices = [];
    for (let i = 0; i < units.length; i += size) slices.push(units.slice(i, i + size));
    return slices;
  }

  const maxOut = resolveWbsLlmMaxOutputTokens(env);
  const perFr = Math.max(1, resolveWbsLlmMaxLeavesPerFr(env) * WBS_LLM_TOKENS_PER_LEAF);
  /** @type {object[][]} */
  const groups = [];
  const index = new Map();
  for (const unit of units) {
    const key = storyGroupKey(unit);
    if (!index.has(key)) {
      const group = [];
      index.set(key, group);
      groups.push(group);
    }
    index.get(key).push(unit);
  }

  /** @type {object[][]} */
  const slices = [];
  let current = [];
  let used = WBS_LLM_PREDICT_ENVELOPE;
  for (const group of groups) {
    const cost = group.length * perFr;
    if (current.length && used + cost > maxOut) {
      slices.push(current);
      current = [];
      used = WBS_LLM_PREDICT_ENVELOPE;
    }
    current = current.concat(group);
    used += cost;
  }
  if (current.length) slices.push(current);
  return slices;
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
  WBS_LLM_DEFAULT_TIMEOUT_MS,
  WBS_LLM_MAX_OUTPUT_TOKENS,
  WBS_LLM_TOKENS_PER_LEAF,
  WBS_LLM_PREDICT_ENVELOPE,
  WBS_LLM_MAX_CHUNKS,
  isHowWbsLlmFlagOn,
  resolveWbsLlmMaxLeavesPerFr,
  resolveWbsLlmMaxOutputTokens,
  resolveWbsFrPerCall,
  resolveWbsLlmNumPredict,
  resolveWbsLlmNumCtx,
  resolveWbsLlmTimeoutMs,
  resolveWbsLlmMaxFr,
  resolveWbsLlmMaxCaps,
  resolveWbsLlmMaxFrForCall,
  planWbsCallSlices,
  resolveWbsLlmMaxChunks,
  shouldAttemptWbsLlm,
};
