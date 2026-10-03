/**
 * Normalize tool execute input to { data, context, policy }.
 * Legacy flat payloads (fr, nfr, …) become data.*; nested context/policy preserved.
 */

const LEGACY_TOP_KEYS = new Set(['data', 'context', 'policy']);

function normalizeToolInput(rawInput = {}, optsContext = {}) {
  const raw = rawInput && typeof rawInput === 'object' ? rawInput : {};
  const hasEnvelope =
    raw.data != null && typeof raw.data === 'object' && !Array.isArray(raw.data);

  let data;
  let context;
  let policy;

  if (hasEnvelope) {
    data = { ...raw.data };
    context = {
      ...(optsContext && typeof optsContext === 'object' ? optsContext : {}),
      ...(raw.context && typeof raw.context === 'object' ? raw.context : {}),
    };
    policy =
      raw.policy && typeof raw.policy === 'object' && !Array.isArray(raw.policy)
        ? { ...raw.policy }
        : {};
  } else {
    data = {};
    context = {
      ...(optsContext && typeof optsContext === 'object' ? optsContext : {}),
    };
    policy = {};
    for (const [k, v] of Object.entries(raw)) {
      if (k === 'context' && v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(context, v);
        continue;
      }
      if (k === 'policy' && v && typeof v === 'object' && !Array.isArray(v)) {
        Object.assign(policy, v);
        continue;
      }
      if (LEGACY_TOP_KEYS.has(k)) continue;
      data[k] = v;
    }
  }

  return { data, context, policy };
}

/**
 * Read a data key from normalized or legacy flat input.
 */
function getData(input, key, fallback = undefined) {
  if (!input || typeof input !== 'object') return fallback;
  if (input.data && typeof input.data === 'object' && key in input.data) {
    return input.data[key];
  }
  if (key in input) return input[key];
  return fallback;
}

function getContext(input, key, fallback = undefined) {
  if (!input || typeof input !== 'object') return fallback;
  if (input.context && typeof input.context === 'object' && key in input.context) {
    return input.context[key];
  }
  return fallback;
}

function getPolicy(input, key, fallback = undefined) {
  if (!input || typeof input !== 'object') return fallback;
  if (input.policy && typeof input.policy === 'object' && key in input.policy) {
    return input.policy[key];
  }
  return fallback;
}

module.exports = {
  normalizeToolInput,
  getData,
  getContext,
  getPolicy,
};
