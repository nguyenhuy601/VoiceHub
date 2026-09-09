/** Pure helpers cho Project Hub TanStack Query keys / unwrap (không import React/API). */

export function unwrapProjectPayload(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export function unwrapProjectMembersList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.members)) return data.members;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function boardDetailQueryScope(includeCards) {
  return includeCards ? 'full' : 'lists';
}

export function changeRequestsFilterHash({
  q = '',
  type = '',
  status = '',
  priority = '',
  sort = '',
  page = 1,
  size = 20,
} = {}) {
  return [q, type, status, priority, sort, page, size].map((v) => String(v ?? '')).join('|');
}

export function mapAssignableMemberRows(payload) {
  const rows = Array.isArray(payload?.members)
    ? payload.members
    : Array.isArray(payload)
      ? payload
      : [];
  return rows
    .map((m) => ({
      id: String(m.userId || m.id || ''),
      name: String(m.displayName || m.username || m.name || '').trim(),
      username: String(m.username || '').trim(),
      avatarUrl: m.avatar || m.avatarUrl || '',
    }))
    .filter((m) => m.id && m.name);
}
