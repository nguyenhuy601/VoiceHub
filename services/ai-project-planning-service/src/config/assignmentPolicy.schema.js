/**
 * Assignment Policy schema — validate / normalize (no business ranking).
 */

const RANK_WEIGHT_KEYS = Object.freeze([
  'skillFit',
  'similarExperience',
  'pastQuality',
  'scheduleConvenience',
  'domainArchFit',
  'resourceEfficiency',
]);

const HARD_GATE_KEYS = Object.freeze([
  'requireRoleMatch',
  'minSkillCoverage',
  'capacityWindowFeasible',
  'excludeSoftOverload',
  'respectProjectCap',
  'dependencyEarliestStart',
]);

const GLOBAL_ASSIGN_MODES = Object.freeze([
  'max_rank_then_epsilon_balance',
  'legacy_load_first',
]);

const WEIGHT_SUM_TOLERANCE = 0.001;

function clamp01(n, fallback = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(0, Math.min(1, x));
}

function clampPositive(n, fallback, { min = 0, max = 1e6 } = {}) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, x));
}

function asBool(v, fallback = false) {
  if (typeof v === 'boolean') return v;
  if (v == null) return fallback;
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function sumWeights(weights = {}) {
  return RANK_WEIGHT_KEYS.reduce((sum, key) => sum + (Number(weights[key]) || 0), 0);
}

/**
 * Normalize a partial/full policy object. Throws if weights invalid after normalize.
 * @param {object} raw
 * @param {{ allowEmptyWeights?: boolean }} [opts]
 * @returns {object}
 */
function normalizeAssignmentPolicy(raw, opts = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('assignment_policy_invalid: expected object');
  }

  const hardGatesIn = raw.hardGates && typeof raw.hardGates === 'object' ? raw.hardGates : {};
  const hardGates = {};
  for (const key of HARD_GATE_KEYS) {
    if (key === 'minSkillCoverage') {
      hardGates[key] = clamp01(hardGatesIn[key], 0.5);
    } else {
      hardGates[key] = asBool(hardGatesIn[key], false);
    }
  }

  const weightsIn = raw.rankWeights && typeof raw.rankWeights === 'object' ? raw.rankWeights : {};
  const rankWeights = {};
  for (const key of RANK_WEIGHT_KEYS) {
    rankWeights[key] = clamp01(weightsIn[key], 0);
  }

  const total = sumWeights(rankWeights);
  if (!opts.allowEmptyWeights && Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE) {
    throw new Error(
      `assignment_policy_invalid: rankWeights sum=${total} (expected 1 ± ${WEIGHT_SUM_TOLERANCE})`
    );
  }

  const fbIn =
    raw.rankWeightsFallback && typeof raw.rankWeightsFallback === 'object'
      ? raw.rankWeightsFallback
      : {};
  const whenMissing = Array.isArray(fbIn.whenMissing)
    ? fbIn.whenMissing.map(String).filter((k) => RANK_WEIGHT_KEYS.includes(k))
    : [];
  const redistributeTo = Array.isArray(fbIn.redistributeTo)
    ? fbIn.redistributeTo.map(String).filter((k) => RANK_WEIGHT_KEYS.includes(k))
    : [];

  const gaIn = raw.globalAssign && typeof raw.globalAssign === 'object' ? raw.globalAssign : {};
  const mode = GLOBAL_ASSIGN_MODES.includes(String(gaIn.mode || ''))
    ? String(gaIn.mode)
    : 'max_rank_then_epsilon_balance';

  const hitlIn = raw.hitl && typeof raw.hitl === 'object' ? raw.hitl : {};

  return {
    version: Math.max(1, Math.floor(Number(raw.version) || 1)),
    profileId: String(raw.profileId || 'software_agile_v1').trim() || 'software_agile_v1',
    hardGates,
    rankWeights,
    rankWeightsFallback: { whenMissing, redistributeTo },
    globalAssign: {
      mode,
      fitEpsilon: clamp01(gaIn.fitEpsilon, 0.03),
      shortlistK: Math.max(1, Math.min(20, Math.floor(Number(gaIn.shortlistK) || 5))),
      maxHoursPerUserFactor: clampPositive(gaIn.maxHoursPerUserFactor, 2, {
        min: 0.25,
        max: 20,
      }),
    },
    hitl: {
      requirePmConfirm: asBool(hitlIn.requirePmConfirm, true),
      allowPickOutsideShortlist: asBool(hitlIn.allowPickOutsideShortlist, false),
    },
  };
}

/**
 * Redistribute weights for missing soft signals (in-place copy).
 * @param {object} policy — already normalized
 * @param {string[]} missingKeys
 * @returns {object} policy with adjusted rankWeights
 */
function applyRankWeightsFallback(policy, missingKeys = []) {
  const missing = (missingKeys || []).filter((k) => RANK_WEIGHT_KEYS.includes(k));
  if (!missing.length) return policy;

  const targets = (policy.rankWeightsFallback?.redistributeTo || []).filter(
    (k) => RANK_WEIGHT_KEYS.includes(k) && !missing.includes(k)
  );
  if (!targets.length) return policy;

  const weights = { ...policy.rankWeights };
  let freed = 0;
  for (const key of missing) {
    freed += Number(weights[key]) || 0;
    weights[key] = 0;
  }
  if (freed <= 0) return { ...policy, rankWeights: weights };

  const share = freed / targets.length;
  for (const key of targets) {
    weights[key] = clamp01((Number(weights[key]) || 0) + share, 0);
  }

  const total = sumWeights(weights);
  if (Math.abs(total - 1) > WEIGHT_SUM_TOLERANCE && total > 0) {
    for (const key of RANK_WEIGHT_KEYS) {
      weights[key] = clamp01((Number(weights[key]) || 0) / total, 0);
    }
  }

  return { ...policy, rankWeights: weights };
}

module.exports = {
  RANK_WEIGHT_KEYS,
  HARD_GATE_KEYS,
  GLOBAL_ASSIGN_MODES,
  WEIGHT_SUM_TOLERANCE,
  normalizeAssignmentPolicy,
  applyRankWeightsFallback,
  sumWeights,
  clamp01,
  asBool,
};
