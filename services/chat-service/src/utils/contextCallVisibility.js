const MODE_PROJECT_INTERSECTION = 'project_intersection';

function envFlagOn(raw, defaultOn = true) {
  const v = String(raw ?? (defaultOn ? 'true' : 'false'))
    .trim()
    .toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

function isContextCallEnabled() {
  return envFlagOn(process.env.ORG_CONTEXT_CALL, true);
}

/**
 * Policy: tin context hiện cả kênh. Tắt (`ORG_CONTEXT_VISIBLE_TO_ROOM=0`) khôi phục filter ẩn tin cũ.
 */
function isContextVisibleToRoom() {
  return envFlagOn(process.env.ORG_CONTEXT_VISIBLE_TO_ROOM, true);
}

/**
 * @param {unknown} raw
 * @returns {{ mode: string, projectId: string, projectName?: string }|null}
 */
function parseVisibility(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = String(raw.mode || '').trim();
  const projectId = String(raw.projectId || '').trim();
  if (mode !== MODE_PROJECT_INTERSECTION || !projectId) return null;
  const name = String(raw.projectName || '').trim().slice(0, 180);
  const out = { mode: MODE_PROJECT_INTERSECTION, projectId };
  if (name) out.projectName = name;
  return out;
}

function isProjectIntersectionVisibility(visibility) {
  return Boolean(
    visibility &&
      visibility.mode === MODE_PROJECT_INTERSECTION &&
      String(visibility.projectId || '').trim()
  );
}

/**
 * Fail closed khi rollback ẩn tin. Khi visible-to-room: mọi viewer kênh thấy bubble.
 * @param {object|null|undefined} visibility
 * @param {string[]} projectIds
 */
function viewerCanSeePayload(visibility, projectIds) {
  if (!isProjectIntersectionVisibility(visibility)) return true;
  if (isContextVisibleToRoom()) return true;
  const pid = String(visibility.projectId || '').trim();
  if (!pid) return false;
  const ids = Array.isArray(projectIds) ? projectIds.map(String) : [];
  return ids.includes(pid);
}

function mongoVisibilityFilter(projectIds) {
  const ids = (Array.isArray(projectIds) ? projectIds : []).map(String).filter(Boolean);
  return {
    $or: [
      { 'visibility.mode': { $exists: false } },
      { 'visibility.mode': { $ne: MODE_PROJECT_INTERSECTION } },
      { 'visibility.projectId': { $in: ids } },
    ],
  };
}

function mergeMongoFilter(filter, extra) {
  if (!extra) return filter || {};
  if (!filter || Object.keys(filter).length === 0) return extra;
  return { $and: [filter, extra] };
}

function meiliVisibilityFilter(projectIds) {
  const ids = (Array.isArray(projectIds) ? projectIds : [])
    .map((id) => String(id || '').trim())
    .filter(Boolean);
  const quoted = ids.map((id) => `"${id.replace(/"/g, '\\"')}"`);
  if (!quoted.length) {
    return `visibilityMode != "${MODE_PROJECT_INTERSECTION}"`;
  }
  return `(visibilityMode != "${MODE_PROJECT_INTERSECTION}" OR visibilityProjectId IN [${quoted.join(', ')}])`;
}

module.exports = {
  MODE_PROJECT_INTERSECTION,
  isContextCallEnabled,
  isContextVisibleToRoom,
  parseVisibility,
  isProjectIntersectionVisibility,
  viewerCanSeePayload,
  mongoVisibilityFilter,
  mergeMongoFilter,
  meiliVisibilityFilter,
};
