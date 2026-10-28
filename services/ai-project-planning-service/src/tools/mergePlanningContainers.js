/**
 * Deep-merge planning containers after parallel HOW tools.
 * Sibling namespaces (planning / analyses / resource) merge; arrays last-write
 * in caller-defined patch order (canonical tool order).
 *
 * planning.tasks / planning.wbs / planning.backlog are atomic (replace, never
 * deep-merge meta keys) so stale hierarchy_chunked keys cannot linger.
 *
 * Parallel BacklogMap ∥ Wbs: tools often spread `planning: { ...base }` so a
 * late patch carries empty sibling atomic keys (tasks:[], wbs:{}, backlog:{}).
 * Empty must not clobber a non-empty base — that wiped Gate2 WBS after a good
 * WbsTool run (EFFORT_NO_LEAVES cascade).
 */

const NAMESPACE_KEYS = Object.freeze(['planning', 'analyses', 'resource', 'phaseRuns']);

/** Owned by BacklogMap / Wbs — replace wholesale when present in a patch. */
const PLANNING_ATOMIC_KEYS = Object.freeze(['tasks', 'wbs', 'backlog']);

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * True when an atomic planning value has no usable content.
 * @param {*} value
 * @param {string} key
 */
function isEmptyPlanningAtomic(value, key) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (!isPlainObject(value)) return false;
  if (key === 'tasks') return true; // non-array tasks is invalid → treat empty
  if (key === 'backlog') {
    const epics = Array.isArray(value.epics) ? value.epics : [];
    const stories = Array.isArray(value.stories) ? value.stories : [];
    const features = Array.isArray(value.features) ? value.features : [];
    return epics.length === 0 && stories.length === 0 && features.length === 0;
  }
  if (key === 'wbs') {
    const nodes = Array.isArray(value.nodes) ? value.nodes : [];
    const roots = Array.isArray(value.roots) ? value.roots : [];
    const leaves = Array.isArray(value.leaves) ? value.leaves : [];
    const taskCount = Number(value.taskCount);
    return (
      nodes.length === 0 &&
      roots.length === 0 &&
      leaves.length === 0 &&
      !(Number.isFinite(taskCount) && taskCount > 0)
    );
  }
  return Object.keys(value).length === 0;
}

/**
 * @param {*} base
 * @param {*} patch
 * @param {string} [parentKey]
 */
function deepMergeValue(base, patch, parentKey = '') {
  if (patch === undefined) return base;
  if (patch === null) return null;
  if (Array.isArray(patch)) return patch;
  if (!isPlainObject(patch)) return patch;
  if (!isPlainObject(base)) return { ...patch };

  const out = { ...base };
  for (const key of Object.keys(patch)) {
    if (parentKey === 'planning' && PLANNING_ATOMIC_KEYS.includes(key)) {
      const nextVal = patch[key];
      const prevVal = out[key];
      if (
        isEmptyPlanningAtomic(nextVal, key) &&
        !isEmptyPlanningAtomic(prevVal, key)
      ) {
        // Keep non-empty base (stale empty sibling from parallel tool spread).
        continue;
      }
      out[key] = nextVal;
      continue;
    }
    out[key] = deepMergeValue(base[key], patch[key], key);
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
        right[key],
        key
      );
    } else {
      out[key] = deepMergeValue(left[key], right[key], key);
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
  PLANNING_ATOMIC_KEYS,
  isEmptyPlanningAtomic,
  deepMergeValue,
  deepMergePlanningContainers,
  mergeParallelToolContainers,
};
