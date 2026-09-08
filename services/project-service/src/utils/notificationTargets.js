function uniqueUserIds(userIds, excludeUserId) {
  const skip = String(excludeUserId || '').trim();
  return [
    ...new Set(
      (userIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== skip)
    ),
  ];
}

/** Gán mới / đổi người — không chuông khi bỏ gán hoặc giữ nguyên. */
function assigneeIdChanged(beforeId, afterId) {
  const next = String(afterId || '').trim();
  const prev = String(beforeId || '').trim();
  return Boolean(next) && next !== prev;
}

function planningWorkLabel(type) {
  const t = String(type || '').trim().toLowerCase();
  if (t === 'epic') return 'Epic';
  if (t === 'feature') return 'Feature';
  if (t === 'milestone') return 'Milestone';
  if (t === 'release') return 'Release';
  if (t === 'roadmap') return 'Roadmap';
  return 'Work';
}

function projectHubActionUrl({ projectId, boardId, organizationId } = {}) {
  const pid = String(projectId || '').trim();
  if (!pid) return '/app/collaborate/projects';
  const params = new URLSearchParams();
  const org = String(organizationId || '').trim();
  const bid = String(boardId || '').trim();
  if (org) params.set('organizationId', org);
  if (bid) params.set('boardId', bid);
  const qs = params.toString();
  return `/app/collaborate/projects/${encodeURIComponent(pid)}${qs ? `?${qs}` : ''}`;
}

module.exports = {
  uniqueUserIds,
  projectHubActionUrl,
  assigneeIdChanged,
  planningWorkLabel,
};
