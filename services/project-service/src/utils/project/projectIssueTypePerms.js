/**
 * Map issueType / planning item → Project Role permission key (Scrum layers).
 */

function normalizeIssueType(issueType, fallback = 'task') {
  const it = String(issueType || '').trim().toLowerCase();
  if (it === 'story' || it === 'bug' || it === 'task') return it;
  return fallback;
}

function createPermissionForIssueType(issueType, { parentTaskId } = {}) {
  if (parentTaskId) return 'task:create';
  const it = normalizeIssueType(issueType);
  if (it === 'story') return 'story:create';
  if (it === 'bug') return 'bug:create';
  return 'task:create';
}

function updatePermissionForIssueType(issueType) {
  const it = normalizeIssueType(issueType);
  if (it === 'story') return 'story:update';
  return 'task:update';
}

function planningWritePermission(type, action) {
  const t = String(type || '').trim().toLowerCase();
  const act = String(action || 'update').trim().toLowerCase();
  if (t === 'epic') {
    if (act === 'create') return 'epic:create';
    if (act === 'delete') return 'epic:delete';
    return 'epic:update';
  }
  return 'backlog:update';
}

module.exports = {
  normalizeIssueType,
  createPermissionForIssueType,
  updatePermissionForIssueType,
  planningWritePermission,
};
