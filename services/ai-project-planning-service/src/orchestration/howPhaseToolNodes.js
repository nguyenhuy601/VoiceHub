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
  // ok:false (incomplete) must not skip — Dependency retries after Wbs leaves exist.
  if (
    results.some(
      (row) => row?.toolName === toolName && !row.error && row.ok !== false
    )
  ) {
    return true;
  }
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
/** Stop reason when a HOW/WHAT tool hard-fails — selectTools must not stub_next. */
const STOP_TOOL_FAILED = 'TOOL_FAILED';

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

/**
 * True when the phase must halt (hard tool error or TOOL_FAILED stop).
 * Incomplete (ok:false, no error) is retryable until attempt cap elsewhere.
 */
function hasPhaseHardToolStop(state) {
  const stop = String(state?.stopReason || '');
  if (stop === STOP_TOOL_FAILED || stop.startsWith(`${STOP_TOOL_FAILED}:`)) return true;
  return (Array.isArray(state?.toolResults) ? state.toolResults : []).some((row) => row?.error);
}

function isValidatedSuccessExecution(row) {
  return Boolean(
    row && row.status === 'succeeded' && row.outputValidated === true && !row.error
  );
}

function isIncompleteExecution(row) {
  if (!row || row.error || row.status === 'failed') return false;
  if (isValidatedSuccessExecution(row)) return false;
  if (row.status === 'skipped') return false;
  if (row.status === 'running' || row.status === 'waiting_external') return false;
  // blocked / incomplete / succeeded without validation
  return (
    row.status === 'blocked' ||
    row.status === 'incomplete' ||
    row.outputValidated === false ||
    (row.status === 'succeeded' && row.outputValidated !== true)
  );
}

/**
 * Incomplete sec rows for one tool (≥ maxAttempts without success) → stuck.
 * Prefers toolExecutions (SoT); falls back to legacy toolResults ok:false.
 * @param {object} state
 * @param {number} [maxAttempts]
 */
function findStuckIncompleteTool(state, maxAttempts = 2) {
  const max = Math.max(1, Number(maxAttempts) || 2);
  const executions = Array.isArray(state?.toolExecutions) ? state.toolExecutions : [];
  if (executions.length) {
    /** @type {Map<string, object[]>} */
    const byName = new Map();
    for (const row of executions) {
      const name = String(row?.toolName || '').trim();
      if (!name) continue;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(row);
    }
    for (const [toolName, rows] of byName) {
      if (rows.some(isValidatedSuccessExecution)) continue;
      const incomplete = rows.filter(isIncompleteExecution);
      if (incomplete.length >= max) {
        return {
          toolName,
          attempts: incomplete.length,
          reason: incomplete[incomplete.length - 1]?.reason || 'incomplete',
        };
      }
    }
    return null;
  }

  /** @type {Map<string, object[]>} */
  const byName = new Map();
  for (const row of Array.isArray(state?.toolResults) ? state.toolResults : []) {
    const name = String(row?.toolName || '').trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(row);
  }
  for (const [toolName, rows] of byName) {
    const succeeded = rows.some((row) => !row?.error && row?.ok !== false);
    if (succeeded) continue;
    const incomplete = rows.filter((row) => !row?.error && row?.ok === false);
    if (incomplete.length >= max) {
      return {
        toolName,
        attempts: incomplete.length,
        reason: incomplete[incomplete.length - 1]?.reason || 'incomplete',
      };
    }
  }
  return null;
}

module.exports = {
  sparseContainerPatch,
  appendList,
  deepMergePlanningContainers,
  shouldSkipHowTool,
  howToolFailure,
  STOP_TOOL_FAILED,
  hasPhaseHardToolStop,
  findStuckIncompleteTool,
  mergeStopReason,
  mergeCurrentToolName,
};
