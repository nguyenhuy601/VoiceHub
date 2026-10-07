/**
 * Sprint board must belong to the authorized project.
 * A foreign or inactive board falls back to the project default.
 */
function pickSprintBoardId({ requestedBoardId, projectId, defaultBoardId, foundBoard }) {
  const fallback = defaultBoardId || null;
  const requested = typeof requestedBoardId === 'string' ? requestedBoardId.trim() : '';
  if (!requested || !foundBoard || foundBoard.isActive === false) return fallback;
  if (String(foundBoard._id || '') !== requested) return fallback;
  if (String(foundBoard.projectId || '') !== String(projectId || '')) return fallback;
  return foundBoard._id;
}

module.exports = {
  pickSprintBoardId,
};
