import { useQuery } from '@tanstack/react-query';
import { projectAPI } from '../../../../services/api/projectAPI';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function memberName(row) {
  const user = row?.user || row?.profile || row;
  const id = String(user?._id || user?.id || row?.userId || '').trim();
  if (!id) return null;
  const name = String(
    user?.fullName ||
      user?.displayName ||
      [user?.lastName, user?.firstName].filter(Boolean).join(' ') ||
      user?.username ||
      row?.displayName ||
      ''
  ).trim();
  return name ? { id, name } : null;
}

/** userId → display name for the current project. Empty map if the call fails. */
export function useProjectMemberNames(projectId) {
  const { data } = useQuery({
    queryKey: ['projectMemberNames', String(projectId || '')],
    queryFn: async () => {
      const raw = unwrap(
        await projectAPI.listMembers(projectId, { skipPermissionDeniedToast: true })
      );
      const list = Array.isArray(raw?.members) ? raw.members : Array.isArray(raw) ? raw : [];
      const map = {};
      for (const row of list) {
        const parsed = memberName(row);
        if (parsed) map[parsed.id] = parsed.name;
      }
      return map;
    },
    enabled: Boolean(projectId),
    staleTime: 60_000,
    retry: false,
  });
  return data || {};
}
