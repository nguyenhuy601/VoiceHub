/**

 * Merge G18 tool output container — artifacts only (no jobs shells).

 */



/**

 * @param {object} container

 * @param {{ result?: object }} toolOut

 */

function applyToolResultToContainer(container, toolOut) {

  const fromTool =

    toolOut?.result?.container && typeof toolOut.result.container === 'object'

      ? toolOut.result.container

      : container;

  let next = fromTool && typeof fromTool === 'object' ? { ...fromTool } : { ...(container || {}) };

  if (next.jobs != null) {

    delete next.jobs;

  }

  return next;

}



module.exports = { applyToolResultToContainer };

