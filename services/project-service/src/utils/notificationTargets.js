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

function projectHubActionUrl({ projectId, boardId, organizationId, module, pathSuffix } = {}) {
  const pid = String(projectId || '').trim();
  if (!pid) return '/app/projects';
  // Prefer pathSuffix when it already includes query (e.g. artifact deep-link).
  const suffix = String(pathSuffix || '').trim().replace(/^\/+/, '');
  const mod = String(module || '').trim().replace(/^\/+/, '');
  let base;
  if (suffix) {
    base = `/app/projects/${encodeURIComponent(pid)}/${suffix}`;
  } else if (mod) {
    base = `/app/projects/${encodeURIComponent(pid)}/${mod}`;
  } else {
    base = `/app/collaborate/projects/${encodeURIComponent(pid)}`;
  }
  // If pathSuffix already has ?, do not append organizationId again blindly.
  if (base.includes('?')) {
    const org = String(organizationId || '').trim();
    const bid = String(boardId || '').trim();
    if (org && !/[?&]organizationId=/.test(base)) {
      base += `&organizationId=${encodeURIComponent(org)}`;
    }
    if (bid && !/[?&]boardId=/.test(base)) {
      base += `&boardId=${encodeURIComponent(bid)}`;
    }
    return base;
  }
  const params = new URLSearchParams();
  const org = String(organizationId || '').trim();
  const bid = String(boardId || '').trim();
  if (org) params.set('organizationId', org);
  if (bid) params.set('boardId', bid);
  const qs = params.toString();
  return `${base}${qs ? `?${qs}` : ''}`;
}

module.exports = {
  uniqueUserIds,
  projectHubActionUrl,
  assigneeIdChanged,
  planningWorkLabel,
};
