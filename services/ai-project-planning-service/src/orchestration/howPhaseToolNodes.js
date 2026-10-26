/**
 * HOW tool helpers for howPhaseGraph (ReAct + Pattern B).
 */

const { deepMergePlanningContainers } = require('../tools/mergePlanningContainers');
const { CANONICAL_ORDER } = require('./howToolDag');

function isPlainObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Drop keys the tool copied unchanged from the pre-node container.
 * Parallel nodes (Backlog ∥ WBS) each spread the whole container; merging those
 * snapshots would let a stale atomic key overwrite the sibling's write.
 * @param {object} base
 * @param {object|null|undefined} next
 */
function sparseContainerPatch(base, next) {
  if (!isPlainObject(next)) return null;
  const patch = {};
  for (const key of Object.keys(next)) {
    if (key === 'jobs') continue;
    const nextVal = next[key];
    const baseVal = base?.[key];
    if (nextVal === baseVal) continue;
    if (key === 'planning' && isPlainObject(nextVal) && isPlainObject(baseVal)) {
      const planning = {};
      for (const child of Object.keys(nextVal)) {
        if (nextVal[child] === baseVal[child]) continue;
        planning[child] = nextVal[child];
      }
      if (Object.keys(planning).length) patch.planning = planning;
      continue;
    }
    patch[key] = nextVal;
  }
  return Object.keys(patch).length ? patch : null;
}

function mergeStopReason(left, right) {
  return left || right || null;
}

function mergeCurrentToolName(left, right) {
  if (!left) return right || null;
  if (!right || left === right) return left;
  const names = new Set(String(`${left}|${right}`).split('|').filter(Boolean));
  return [...names].join('|');
}

function appendList(left, right) {
  const base = Array.isArray(left) ? left : [];
  if (right == null) return base;
  return base.concat(Array.isArray(right) ? right : [right]);
}

function shouldSkipHowTool(state, toolName) {
  const stop = String(state?.stopReason || '');
  if (stop.startsWith('BUDGET_') || stop === 'TOOL_FAILED') return true;
  const results = Array.isArray(state?.toolResults) ? state.toolResults : [];
  if (results.some((row) => row?.error)) return true;
  if (results.some((row) => row?.toolName === toolName && !row.error)) return true;
  if (state?.selective) {
    const names = Array.isArray(state.selectiveToolNames) ? state.selectiveToolNames : [];
    if (!names.includes(toolName)) return true;
  }
  const index = CANONICAL_ORDER.indexOf(toolName);
  const startIndex = Number(state?.startIndex) || 0;
  if (!state?.selective && index >= 0 && index < startIndex) return true;
  return false;
}

/**
 * @param {Array<{ toolName?: string, error?: object }>|null|undefined} toolResults
 * @returns {Error|null}
 */
function howToolFailure(toolResults) {
  const failed = (Array.isArray(toolResults) ? toolResults : []).filter((row) => row?.error);
  if (!failed.length) return null;
  const names = failed.map((row) => row.toolName || 'tool').join(', ');
  const err = new Error(
    failed
      .map((row) => {
        const name = row.toolName || 'tool';
        const message = String(row.error?.message || '').trim();
        return message ? `${name}: ${message}` : name;
      })
      .join('; ')
  );
  err.code =
    failed.length === 1 && failed[0].error?.code === 'WBS_DECOMPOSITION_FAILED'
      ? 'WBS_DECOMPOSITION_FAILED'
      : 'HOW_TOOL_FAILED';
  err.toolNames = names;
  err.failedTools = failed;
  return err;
}

module.exports = {
  sparseContainerPatch,
  appendList,
  deepMergePlanningContainers,
  shouldSkipHowTool,
  howToolFailure,
  mergeStopReason,
  mergeCurrentToolName,
};
