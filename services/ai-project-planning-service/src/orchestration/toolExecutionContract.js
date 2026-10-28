/**
 * HOW ToolExecution contract — LangGraph state channel SoT.
 * Parallel Send merges via reduceToolExecutions (by toolName + executionId).
 */

const crypto = require('crypto');

const TOOL_EXECUTION_STATUSES = Object.freeze([
  'pending',
  'running',
  'waiting_external',
  'succeeded',
  'blocked',
  'failed',
  'skipped',
]);

const ERROR_CODES = Object.freeze({
  TOOL_RESULT_MISSING: 'TOOL_RESULT_MISSING',
  TOOL_OUTPUT_INVALID: 'TOOL_OUTPUT_INVALID',
  ADAPTER_RESULT_LOST: 'ADAPTER_RESULT_LOST',
  TOOL_FAILED: 'TOOL_FAILED',
  TOOL_STUCK_INCOMPLETE: 'TOOL_STUCK_INCOMPLETE',
  INPUT_MISSING: 'INPUT_MISSING',
});

function stableHash(value) {
  const json = JSON.stringify(value ?? null);
  return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
}

function newExecutionId(toolName) {
  const t = String(toolName || 'tool').replace(/\W+/g, '_');
  return `ex_${t}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {Partial<object>} partial
 * @returns {object}
 */
function createToolExecution(partial = {}) {
  const toolName = String(partial.toolName || '').trim();
  const status = TOOL_EXECUTION_STATUSES.includes(partial.status)
    ? partial.status
    : 'pending';
  const attempt = Math.max(1, Number(partial.attempt) || 1);
  const executionId = String(partial.executionId || newExecutionId(toolName));
  const inputHash =
    partial.inputHash != null
      ? String(partial.inputHash)
      : stableHash(partial.inputFingerprint ?? {});

  const row = {
    executionId,
    toolName,
    inputHash,
    status,
    attempt,
    outputValidated: Boolean(partial.outputValidated),
  };
  if (partial.outputRef != null) row.outputRef = String(partial.outputRef);
  if (Array.isArray(partial.blockedBy) && partial.blockedBy.length) {
    row.blockedBy = partial.blockedBy.map(String);
  }
  if (partial.error && typeof partial.error === 'object') {
    row.error = {
      code: String(partial.error.code || ERROR_CODES.TOOL_FAILED),
      retryable: Boolean(partial.error.retryable),
      message: String(partial.error.message || '').slice(0, 400),
    };
  }
  if (partial.startedAt) row.startedAt = String(partial.startedAt);
  if (partial.deadlineAt) row.deadlineAt = String(partial.deadlineAt);
  if (partial.progress && typeof partial.progress === 'object') {
    row.progress = partial.progress;
  }
  if (partial.jobId != null) row.jobId = String(partial.jobId);
  if (partial.reason != null) row.reason = String(partial.reason);
  return row;
}

function isSucceededExecution(row) {
  return (
    row &&
    row.status === 'succeeded' &&
    row.outputValidated === true &&
    !row.error
  );
}

function isFailedExecution(row) {
  return Boolean(row && (row.status === 'failed' || row.error));
}

function isTerminalExecution(row) {
  return (
    row &&
    (row.status === 'succeeded' ||
      row.status === 'failed' ||
      row.status === 'skipped' ||
      row.status === 'blocked')
  );
}

/**
 * LangGraph reducer: merge by toolName (latest executionId wins per tool),
 * append distinct executionIds for attempt history.
 * @param {object[]|null} left
 * @param {object[]|null|object} right
 */
function reduceToolExecutions(left, right) {
  const base = Array.isArray(left) ? [...left] : [];
  if (right == null) return base;
  const incoming = Array.isArray(right) ? right : [right];
  const byId = new Map();
  for (const row of base) {
    if (row?.executionId) byId.set(String(row.executionId), row);
  }
  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const row = createToolExecution(raw);
    byId.set(row.executionId, { ...(byId.get(row.executionId) || {}), ...row });
  }
  return [...byId.values()];
}

/**
 * Latest execution per toolName (by attempt then startedAt).
 * @param {object[]} executions
 * @returns {Map<string, object>}
 */
function latestExecutionByTool(executions) {
  const map = new Map();
  for (const row of Array.isArray(executions) ? executions : []) {
    const name = String(row?.toolName || '').trim();
    if (!name) continue;
    const prev = map.get(name);
    if (!prev) {
      map.set(name, row);
      continue;
    }
    const a = Number(row.attempt) || 0;
    const b = Number(prev.attempt) || 0;
    if (a > b) map.set(name, row);
    else if (a === b && String(row.startedAt || '') > String(prev.startedAt || '')) {
      map.set(name, row);
    }
  }
  return map;
}

/**
 * Tools with succeeded+validated latest execution.
 * @param {object} state
 * @returns {Set<string>}
 */
function succeededValidatedTools(state) {
  const set = new Set();
  const list = Array.isArray(state?.toolExecutions)
    ? state.toolExecutions
    : Array.isArray(state?.toolResults)
      ? state.toolResults
      : [];
  // Prefer toolExecutions; fall back to legacy toolResults shape during migration.
  if (Array.isArray(state?.toolExecutions) && state.toolExecutions.length) {
    for (const [, row] of latestExecutionByTool(state.toolExecutions)) {
      if (isSucceededExecution(row)) set.add(row.toolName);
    }
    return set;
  }
  for (const row of list) {
    if (!row || row.error || row.ok === false) continue;
    if (row.status && row.status !== 'succeeded') continue;
    if (row.status === 'succeeded' && row.outputValidated !== true) continue;
    // Legacy success row: no status field, no error, ok !== false
    if (!row.status && row.ok === false) continue;
    const name = String(row.toolName || '').trim();
    if (name) {
      if (row.status === 'succeeded' && row.outputValidated === true) set.add(name);
      else if (!row.status) set.add(name);
    }
  }
  return set;
}

function failedTools(state) {
  const set = new Set();
  const list = Array.isArray(state?.toolExecutions)
    ? state.toolExecutions
    : Array.isArray(state?.toolResults)
      ? state.toolResults
      : [];
  if (Array.isArray(state?.toolExecutions) && state.toolExecutions.length) {
    for (const [, row] of latestExecutionByTool(state.toolExecutions)) {
      if (isFailedExecution(row)) set.add(row.toolName);
    }
    return set;
  }
  for (const row of list) {
    if (row?.error || row?.status === 'failed') {
      const name = String(row.toolName || '').trim();
      if (name) set.add(name);
    }
  }
  return set;
}

function attemptCountForTool(state, toolName) {
  const name = String(toolName || '').trim();
  let n = 0;
  for (const row of Array.isArray(state?.toolExecutions) ? state.toolExecutions : []) {
    if (String(row?.toolName || '') === name) n += 1;
  }
  if (n) return n;
  for (const row of Array.isArray(state?.toolResults) ? state.toolResults : []) {
    if (String(row?.toolName || '') === name) n += 1;
  }
  return n;
}

/**
 * Legacy toolResults row ↔ ToolExecution bridge (writers emit both during migration).
 */
function executionToLegacyToolResult(execution) {
  const ex = createToolExecution(execution);
  if (ex.status === 'succeeded' && ex.outputValidated) {
    return { toolName: ex.toolName, ok: true, executionId: ex.executionId };
  }
  if (ex.status === 'blocked') {
    return {
      toolName: ex.toolName,
      ok: false,
      reason: ex.reason || 'blocked',
      executionId: ex.executionId,
      error: ex.error,
    };
  }
  if (ex.status === 'failed' || ex.error) {
    return {
      toolName: ex.toolName,
      ok: false,
      executionId: ex.executionId,
      error: ex.error || {
        code: ERROR_CODES.TOOL_FAILED,
        message: 'failed',
        retryable: false,
      },
    };
  }
  // incomplete / waiting — legacy ok:false without hard error
  return {
    toolName: ex.toolName,
    ok: false,
    reason: ex.reason || ex.status,
    executionId: ex.executionId,
  };
}

/**
 * After Pattern B Send: parent must see an execution for toolName.
 * @returns {object|null} failed ToolExecution if missing
 */
function detectParentResultMiss(state, toolName, opts = {}) {
  const name = String(toolName || '').trim();
  if (!name) return null;
  const list = Array.isArray(state?.toolExecutions) ? state.toolExecutions : [];
  const has = list.some((row) => String(row?.toolName || '') === name);
  if (has) return null;
  // Also accept legacy toolResults written in same turn
  const legacy = Array.isArray(state?.toolResults) ? state.toolResults : [];
  if (legacy.some((row) => String(row?.toolName || '') === name)) return null;
  return createToolExecution({
    toolName: name,
    status: 'failed',
    attempt: opts.attempt || 1,
    inputHash: opts.inputHash || 'unknown',
    outputValidated: false,
    error: {
      code: ERROR_CODES.ADAPTER_RESULT_LOST,
      retryable: true,
      message: `Pattern B subgraph completed but parent missing ToolExecution for ${name}`,
    },
  });
}

function hashToolInput(toolName, fingerprint) {
  return stableHash({ tool: toolName, ...(fingerprint && typeof fingerprint === 'object' ? fingerprint : {}) });
}

module.exports = {
  TOOL_EXECUTION_STATUSES,
  ERROR_CODES,
  stableHash,
  newExecutionId,
  createToolExecution,
  isSucceededExecution,
  isFailedExecution,
  isTerminalExecution,
  reduceToolExecutions,
  latestExecutionByTool,
  succeededValidatedTools,
  failedTools,
  attemptCountForTool,
  executionToLegacyToolResult,
  detectParentResultMiss,
  hashToolInput,
};
