/**
 * Checkpoint lifecycle — ACTIVE | RESUMABLE | TERMINAL (S5).
 * failed is NOT always TERMINAL — seekable CP stays RESUMABLE.
 */

const LIFECYCLE = Object.freeze({
  ACTIVE: 'ACTIVE',
  RESUMABLE: 'RESUMABLE',
  TERMINAL: 'TERMINAL',
});

const HARD_TERMINAL_STATUSES = new Set(['completed', 'cancelled', 'expired']);
const ACTIVE_STATUSES = new Set([
  'queued',
  'running',
  'callback_pending',
  'callback_delivering',
  'waiting_human',
  'replanning',
]);

function keepTerminalForDebug(env = process.env) {
  const raw = String(env.AGENT_STATE_KEEP_TERMINAL ?? '0').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

/**
 * @param {object|null|undefined} checkpoint — AgentState or { state }
 */
function extractState(checkpoint) {
  if (!checkpoint || typeof checkpoint !== 'object') return null;
  if (checkpoint.state && typeof checkpoint.state === 'object') return checkpoint.state;
  return checkpoint;
}

/**
 * Seekable HOW/WHAT resume cursor present and usable.
 * @param {object|null} state
 */
function hasValidResumeCursor(state) {
  if (!state || typeof state !== 'object') return false;
  if (typeof state.currentToolIndex === 'number' && Number.isFinite(state.currentToolIndex)) {
    return state.currentToolIndex >= 0;
  }
  if (state.selectiveReplanSteps && Array.isArray(state.selectiveReplanSteps)) {
    return state.selectiveReplanSteps.length > 0;
  }
  if (state.g4Partial || state.understandingPartial) return true;
  if (state.container && typeof state.container === 'object') return true;
  return false;
}

/**
 * Error codes that are explicitly non-resumable / terminal business fails.
 */
const TERMINAL_ERROR_CODES = new Set([
  'data_gate_rejected',
  'CALLBACK_RETRY_EXHAUSTED',
  'EXECUTION_RETRY_EXHAUSTED',
  'BUDGET_EXCEEDED',
  'AGENT_PHASE_FAILED_TERMINAL',
]);

/**
 * @param {{
 *   status?: string,
 *   error?: object|null,
 *   checkpoint?: object|null,
 *   explicitTerminal?: boolean,
 * }} input
 * @returns {'ACTIVE'|'RESUMABLE'|'TERMINAL'}
 */
function classifyCheckpointLifecycle(input = {}) {
  if (input.explicitTerminal === true) return LIFECYCLE.TERMINAL;

  const status = String(input.status || '').trim().toLowerCase();
  if (HARD_TERMINAL_STATUSES.has(status)) return LIFECYCLE.TERMINAL;

  if (ACTIVE_STATUSES.has(status)) return LIFECYCLE.ACTIVE;

  if (status === 'failed') {
    const errCode = String(input.error?.code || input.error?.errorCode || '').trim();
    if (TERMINAL_ERROR_CODES.has(errCode)) return LIFECYCLE.TERMINAL;

    const state = extractState(input.checkpoint);
    if (state && hasValidResumeCursor(state)) return LIFECYCLE.RESUMABLE;

    // failed without usable checkpoint → TERMINAL
    return LIFECYCLE.TERMINAL;
  }

  // unknown status: keep if CP looks resumable
  const state = extractState(input.checkpoint);
  if (state && hasValidResumeCursor(state)) return LIFECYCLE.RESUMABLE;
  return LIFECYCLE.TERMINAL;
}

/**
 * Delete G15 when TERMINAL (unless debug keep).
 * @param {string} runId
 * @param {object} classifyInput
 * @param {{ deleteCheckpoint: (id: string) => Promise<unknown>, env?: object }} deps
 */
async function clearCheckpointIfTerminal(runId, classifyInput, deps) {
  const lifecycle = classifyCheckpointLifecycle(classifyInput);
  if (lifecycle !== LIFECYCLE.TERMINAL) {
    return { lifecycle, deleted: false };
  }
  if (keepTerminalForDebug(deps.env || process.env)) {
    return { lifecycle, deleted: false, keptForDebug: true };
  }
  const id = String(runId || '').trim();
  if (id && typeof deps.deleteCheckpoint === 'function') {
    await deps.deleteCheckpoint(id);
  }
  return { lifecycle, deleted: true };
}

module.exports = {
  LIFECYCLE,
  HARD_TERMINAL_STATUSES,
  classifyCheckpointLifecycle,
  clearCheckpointIfTerminal,
  hasValidResumeCursor,
  keepTerminalForDebug,
};
