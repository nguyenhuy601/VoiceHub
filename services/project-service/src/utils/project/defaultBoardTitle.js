/**
 * Default Kanban board title = project abbreviation (projectCode).
 * Explicit title from client wins when non-empty.
 */

const FALLBACK_BOARD_TITLE = 'PRJ';

/**
 * @param {unknown} projectCode
 * @returns {string}
 */
function resolveDefaultBoardTitle(projectCode) {
  const code = String(projectCode || '').trim();
  return code || FALLBACK_BOARD_TITLE;
}

/**
 * @param {{ title?: unknown, projectCode?: unknown }} [opts]
 * @returns {string}
 */
function resolveBoardTitle(opts = {}) {
  const explicit = String(opts.title || '').trim();
  if (explicit) return explicit;
  return resolveDefaultBoardTitle(opts.projectCode);
}

module.exports = {
  FALLBACK_BOARD_TITLE,
  resolveDefaultBoardTitle,
  resolveBoardTitle,
};
