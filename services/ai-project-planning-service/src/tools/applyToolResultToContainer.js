/**
 * Merge G18 tool output container — deep-merge namespaces (parallel-safe).
 */

const { deepMergePlanningContainers } = require('./mergePlanningContainers');

/**
 * @param {object} container
 * @param {{ result?: object }} toolOut
 */
function applyToolResultToContainer(container, toolOut) {
  const fromTool =
    toolOut?.result?.container && typeof toolOut.result.container === 'object'
      ? toolOut.result.container
      : null;
  if (!fromTool) {
    const next =
      container && typeof container === 'object' ? { ...container } : {};
    if (next.jobs != null) delete next.jobs;
    return next;
  }
  return deepMergePlanningContainers(container || {}, fromTool);
}

module.exports = { applyToolResultToContainer };
