/**
 * Deep-merge planning containers after parallel HOW tools.
 * Sibling namespaces (planning / analyses / resource) merge; arrays last-write
 * in caller-defined patch order (canonical tool order).
 */

const NAMESPACE_KEYS = Object.freeze(['planning', 'analyses', 'resource', 'phaseRuns']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {*} base
 * @param {*} patch
 */
function deepMergeValue(base, patch) {
  if (patch === undefined) return base;
  if (patch === null) return null;
  if (Array.isArray(patch)) return patch;
  if (!isPlainObject(patch)) return patch;
  if (!isPlainObject(base)) return { ...patch };

  const out = { ...base };
  for (const key of Object.keys(patch)) {
    out[key] = deepMergeValue(base[key], patch[key]);
  }
  return out;
}

/**
 * Merge one tool result container onto base (preserves sibling keys).
 * @param {object} base
 * @param {object} patch
 */
function deepMergePlanningContainers(base, patch) {
  const left =
    base && typeof base === 'object' && !Array.isArray(base) ? { ...base } : {};
  const right =
    patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : null;
  if (!right) return left;

  const out = { ...left };
  for (const key of Object.keys(right)) {
    if (key === 'jobs') continue;
    if (NAMESPACE_KEYS.includes(key) && isPlainObject(right[key])) {
      out[key] = deepMergeValue(
        isPlainObject(left[key]) ? left[key] : {},
        right[key]
      );
    } else {
      out[key] = deepMergeValue(left[key], right[key]);
    }
  }
  if (out.jobs != null) delete out.jobs;
  return out;
}

/**
 * Apply multiple parallel tool containers onto the shared pre-layer base.
 * @param {object} baseContainer — container before the layer ran
 * @param {Array<object|null|undefined>} patchContainers — each tool's result.container
 */
function mergeParallelToolContainers(baseContainer, patchContainers) {
  let next =
    baseContainer && typeof baseContainer === 'object'
      ? { ...baseContainer }
      : {};
  if (next.jobs != null) delete next.jobs;

  const patches = Array.isArray(patchContainers) ? patchContainers : [];
  for (const patch of patches) {
    if (!patch || typeof patch !== 'object') continue;
    next = deepMergePlanningContainers(next, patch);
  }
  return next;
}

module.exports = {
  NAMESPACE_KEYS,
  deepMergeValue,
  deepMergePlanningContainers,
  mergeParallelToolContainers,
};
