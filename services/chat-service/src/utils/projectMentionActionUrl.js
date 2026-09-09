function buildProjectMentionActionUrl({ organizationId, roomId, projectId } = {}) {
  const oid = String(organizationId || '').trim();
  const rid = String(roomId || '').trim();
  const pid = String(projectId || '').trim();
  if (pid) {
    const params = new URLSearchParams();
    if (oid) params.set('organizationId', oid);
    params.set('tab', 'chat');
    if (rid) params.set('channelId', rid);
    return `/app/collaborate/projects/${encodeURIComponent(pid)}?${params.toString()}`;
  }
  if (oid && rid) {
    return `/app/collaborate/organizations/${encodeURIComponent(oid)}/channels?channelId=${encodeURIComponent(rid)}`;
  }
  return '/app/collaborate/projects';
}

module.exports = { buildProjectMentionActionUrl };
