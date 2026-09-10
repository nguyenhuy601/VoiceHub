/**
 * Batch-map TaskBoard → Project identity for dashboard board health (additive fields).
 * Pure helpers — no DB / HTTP.
 */

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value).trim();
}

/**
 * @param {Array<{ _id?: unknown, id?: unknown, title?: string, projectId?: unknown }>} boardDocs
 * @returns {{ titleById: Map<string, string>, projectIdByBoardId: Map<string, string> }}
 */
function indexTaskBoardsForDashboard(boardDocs = []) {
  const titleById = new Map();
  const projectIdByBoardId = new Map();
  const list = Array.isArray(boardDocs) ? boardDocs : [];

  for (const board of list) {
    const boardId = asId(board?._id || board?.id);
    if (!boardId) continue;
    titleById.set(boardId, String(board?.title || '').trim() || boardId);
    const projectId = asId(board?.projectId);
    if (projectId) projectIdByBoardId.set(boardId, projectId);
  }

  return { titleById, projectIdByBoardId };
}

/**
 * @param {Array<{ _id?: unknown, id?: unknown, title?: string, projectCode?: string }>} projectDocs
 * @returns {Map<string, { projectTitle: string, projectCode: string }>}
 */
function indexProjectsForBoardIdentity(projectDocs = []) {
  /** @type {Map<string, { projectTitle: string, projectCode: string }>} */
  const byId = new Map();
  const list = Array.isArray(projectDocs) ? projectDocs : [];

  for (const project of list) {
    const projectId = asId(project?._id || project?.id);
    if (!projectId) continue;
    byId.set(projectId, {
      projectTitle: String(project?.title || '').trim(),
      projectCode: String(project?.projectCode || '').trim(),
    });
  }

  return byId;
}

/**
 * @param {Map<string, string>} projectIdByBoardId
 * @returns {string[]}
 */
function uniqueProjectIdsFromBoards(projectIdByBoardId) {
  if (!projectIdByBoardId || typeof projectIdByBoardId.values !== 'function') return [];
  return [...new Set([...projectIdByBoardId.values()].filter(Boolean))];
}

/**
 * Map one aggregate board row → dashboard boards[] item (additive identity).
 * `name` remains TaskBoard.title; do not replace with project title.
 *
 * @param {{ _id?: unknown, total?: number, done?: number, open?: number, overdue?: number }} row
 * @param {Map<string, string>} titleById
 * @param {Map<string, string>} projectIdByBoardId
 * @param {Map<string, { projectTitle: string, projectCode: string }>} projectById
 */
function mapBoardStatsRow(row, titleById, projectIdByBoardId, projectById) {
  const id = asId(row?._id) || String(row?._id || '');
  const projectId =
    (projectIdByBoardId && typeof projectIdByBoardId.get === 'function'
      ? projectIdByBoardId.get(id)
      : '') || '';
  const identity =
    projectId && projectById && typeof projectById.get === 'function'
      ? projectById.get(projectId)
      : null;

  return {
    id,
    name: (titleById && titleById.get(id)) || id,
    total: Number(row?.total) || 0,
    done: Number(row?.done) || 0,
    open: Number(row?.open) || 0,
    overdue: Number(row?.overdue) || 0,
    projectId,
    projectTitle: identity?.projectTitle || '',
    projectCode: identity?.projectCode || '',
  };
}

module.exports = {
  asId,
  indexTaskBoardsForDashboard,
  indexProjectsForBoardIdentity,
  uniqueProjectIdsFromBoards,
  mapBoardStatsRow,
};
