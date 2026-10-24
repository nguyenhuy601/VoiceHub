const EXECUTION_INTERRUPTED = 'EXECUTION_INTERRUPTED';

/**
 * User-facing stop when the worker dies or the service restarts mid-run.
 * @param {string} [message]
 */
function buildExecutionInterruptedError(message) {
  const text = String(
    message || 'Planning worker stopped while the run was still in progress'
  ).trim();
  return {
    code: EXECUTION_INTERRUPTED,
    message: text.slice(0, 400),
  };
}

module.exports = {
  EXECUTION_INTERRUPTED,
  buildExecutionInterruptedError,
};
