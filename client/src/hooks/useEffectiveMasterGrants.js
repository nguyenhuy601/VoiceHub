import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import roleAPI from '../services/api/roleAPI';
import { parseUserPermissionsPayload } from '../config/rbacUiGrantMap';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_RBAC_GRANTS_MS } from '../lib/queryClient';

/**
 * Fetch master grants — throws on network/API failure so hook can surface `error: true`.
 */
export async function fetchEffectiveMasterGrants(userId, orgId) {
  const res = await roleAPI.getUserPermissions(userId, orgId);
  const parsed = parseUserPermissionsPayload(res);
  return parsed.masterGrants
    .map((k) => String(k || '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Master grants V2 của user hiện tại trong org (GET /permissions/user/:me/server/:orgId).
 * Shared via React Query — Admin sidebar + DomainPage + panels = 1 GET.
 */
export function useEffectiveMasterGrants(orgId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = String(user?.userId || user?._id || user?.id || '').trim();
  const id = String(orgId || '').trim();
  const enabled = Boolean(id && userId);

  const query = useQuery({
    queryKey: queryKeys.rbac.grants(id, userId),
    queryFn: () => fetchEffectiveMasterGrants(userId, id),
    enabled,
    staleTime: STALE_TIME_RBAC_GRANTS_MS,
    retry: 1,
  });

  const grants = enabled && Array.isArray(query.data) ? query.data : [];
  const loading = enabled && query.isPending;
  const error = Boolean(enabled && query.isError);

  const reload = useCallback(async () => {
    if (!enabled) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.rbac.grants(id, userId) });
  }, [enabled, id, userId, queryClient]);

  const grantSet = useMemo(() => new Set(grants), [grants]);
  const hasGrant = useCallback(
    (key) => grantSet.has(String(key || '').trim().toLowerCase()),
    [grantSet]
  );

  return { grants, hasGrant, loading, error, reload };
}

export default useEffectiveMasterGrants;
