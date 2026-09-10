/**
 * Map board health (dashboard summary) → Project Hub identity.
 * Wave 1: map từ list projects client.
 * Wave 2: ưu tiên projectId/projectTitle/projectCode từ BE; FE chỉ fallback.
 */

function asId(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value).trim();
}

/**
 * @typedef {{ projectId: string, projectTitle: string, projectCode: string, organizationId: string, boardId: string }} BoardHealthProjectRef
 */

/**
 * Index boardId → project ref từ list Projects (defaultBoardId + boards[]).
 * @param {unknown[]} projects
 * @returns {Map<string, BoardHealthProjectRef>}
 */
export function buildBoardIdToProjectIndex(projects = []) {
  /** @type {Map<string, BoardHealthProjectRef>} */
  const byBoardId = new Map();
  const list = Array.isArray(projects) ? projects : [];

  for (const project of list) {
    const projectId = asId(project?.projectId || project?._id || project?.id);
    if (!projectId) continue;
    const projectTitle = String(project?.title || project?.name || '').trim();
    const projectCode = String(project?.projectCode || project?.code || '').trim();
    const organizationId = asId(
      project?.organizationId || project?.organization || project?.orgId
    );

    const boardIds = new Set();
    const defaultBoardId = asId(project?.defaultBoardId);
    if (defaultBoardId) boardIds.add(defaultBoardId);
    const boards = Array.isArray(project?.boards) ? project.boards : [];
    for (const board of boards) {
      const bid = asId(board);
      if (bid) boardIds.add(bid);
    }

    for (const boardId of boardIds) {
      byBoardId.set(boardId, {
        projectId,
        projectTitle,
        projectCode,
        organizationId,
        boardId,
      });
    }
  }

  return byBoardId;
}

/**
 * Parse GET board detail (sau attachProjectIdentity: title = tên dự án).
 * @param {unknown} detailPayload — unwrapTaskBoardDetailPayload hoặc { board }
 * @returns {BoardHealthProjectRef | null}
 */
export function projectRefFromBoardDetailPayload(detailPayload) {
  const board =
    detailPayload && typeof detailPayload === 'object' && detailPayload.board
      ? detailPayload.board
      : detailPayload;
  if (!board || typeof board !== 'object') return null;
  const projectId = asId(board.projectId || board.project?._id || board.project?.id);
  if (!projectId) return null;
  const projectTitle = String(
    board.project?.title || board.title || board.name || ''
  ).trim();
  const projectCode = String(
    board.projectCode || board.project?.projectCode || board.code || ''
  ).trim();
  const organizationId = asId(board.organizationId || board.organization || board.orgId);
  const boardId = asId(board._id || board.id);
  return {
    projectId,
    projectTitle,
    projectCode,
    organizationId,
    boardId,
  };
}

/**
 * @param {{ id?: string, _id?: string, organizationId?: string } | null | undefined} board
 * @param {Map<string, BoardHealthProjectRef>} index
 * @returns {BoardHealthProjectRef | null}
 */
export function resolveBoardHealthProject(board, index) {
  if (!index || typeof index.get !== 'function') return null;
  const boardId = asId(board?.id || board?._id);
  if (!boardId) return null;
  return index.get(boardId) || null;
}

/**
 * Gắn projectId / projectTitle / projectCode lên row board health (không ghi đè id board).
 * Wave 2: ưu tiên identity từ BE (dashboard summary); chỉ fill field trống từ index FE.
 * @param {object} board
 * @param {Map<string, BoardHealthProjectRef>} index
 */
export function enrichBoardHealthRow(board, index) {
  const row = board && typeof board === 'object' ? board : {};
  const existingProjectId = String(row.projectId || '').trim();
  const existingTitle = String(row.projectTitle || '').trim();
  const existingCode = String(row.projectCode || '').trim();
  const resolved = resolveBoardHealthProject(row, index);

  if (existingProjectId) {
    return {
      ...row,
      projectId: existingProjectId,
      projectTitle: existingTitle || resolved?.projectTitle || '',
      projectCode: existingCode || resolved?.projectCode || '',
      organizationId: String(row.organizationId || resolved?.organizationId || '').trim(),
    };
  }

  if (!resolved) {
    return {
      ...row,
      projectId: '',
      projectTitle: existingTitle,
      projectCode: existingCode,
    };
  }

  return {
    ...row,
    projectId: resolved.projectId,
    projectTitle: resolved.projectTitle || existingTitle,
    projectCode: resolved.projectCode || existingCode,
    organizationId: String(row.organizationId || resolved.organizationId || '').trim(),
  };
}

/**
 * Áp thêm refs từ getBoardDetail (boardId → ref).
 * @param {object[]} boards
 * @param {Record<string, BoardHealthProjectRef | null | undefined>} detailByBoardId
 */
export function applyBoardDetailRefs(boards = [], detailByBoardId = {}) {
  return (Array.isArray(boards) ? boards : []).map((board) => {
    const row = board && typeof board === 'object' ? board : {};
    if (String(row.projectId || '').trim()) return row;
    const boardId = asId(row.id || row._id);
    if (!boardId || !Object.prototype.hasOwnProperty.call(detailByBoardId, boardId)) {
      return row;
    }
    const hit = detailByBoardId[boardId];
    if (!hit?.projectId) {
      return { ...row, enrichmentFailed: true };
    }
    return {
      ...row,
      projectId: hit.projectId,
      projectTitle: hit.projectTitle || String(row.projectTitle || '').trim(),
      projectCode: hit.projectCode || String(row.projectCode || '').trim(),
      organizationId: String(row.organizationId || hit.organizationId || '').trim(),
      enrichmentFailed: false,
    };
  });
}

/**
 * @param {unknown[]} boards
 * @param {unknown[]} projects
 */
export function enrichBoardHealthList(boards = [], projects = []) {
  const index = buildBoardIdToProjectIndex(projects);
  return (Array.isArray(boards) ? boards : []).map((b) => enrichBoardHealthRow(b, index));
}
