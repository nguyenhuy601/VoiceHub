/** Deep-link tới trang hub admin (picker + ?tab=). */
export function adminUserHubLink(path, userId, tab) {
  const params = new URLSearchParams();
  const id = String(userId || '').trim();
  if (id) params.set('userId', id);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function adminOrgUnitHubLink(path, unitId, tab) {
  const params = new URLSearchParams();
  const id = String(unitId || '').trim();
  if (id) params.set('unitId', id);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function adminMeetingHubLink(path, meetingId, tab) {
  const params = new URLSearchParams();
  const id = String(meetingId || '').trim();
  if (id) params.set('meetingId', id);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export function adminRoleHubLink(path, roleId, tab, paramKey = 'roleId') {
  const params = new URLSearchParams();
  const id = String(roleId || '').trim();
  if (id) params.set(paramKey, id);
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** Deep-link hub với query tùy ý (ví dụ Position ?title=). */
export function adminQueryHubLink(path, query = {}, tab) {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    const normalized = String(value ?? '').trim();
    if (normalized) params.set(key, normalized);
  });
  if (tab) params.set('tab', tab);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
