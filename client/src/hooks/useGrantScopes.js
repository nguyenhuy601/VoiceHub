import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/AuthContext';
import roleAPI from '../services/api/roleAPI';
import { parseUserPermissionsPayload } from '../config/rbacUiGrantMap';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_RBAC_GRANTS_MS } from '../lib/queryClient';

const EMPTY_SCOPES = Object.freeze({});

/**
 * Chỉ bọc shell `/app/admin` khi JWT `systemRole=admin`.
 * Ngoài provider, grant vẫn chỉ đến từ vị trí tổ chức.
 */
const AdminSystemGrantContext = createContext(false);

export function AdminSystemGrantProvider({ children }) {
  return createElement(AdminSystemGrantContext.Provider, { value: true }, children);
}

/**
 * grantScopes của user trong org — từ vị trí tổ chức (Position → Org Role → Permission+Scope).
 */
export async function fetchGrantScopes(userId, orgId) {
  const res = await roleAPI.getUserPermissions(userId, orgId);
  const parsed = parseUserPermissionsPayload(res);
  return parsed.grantScopes && typeof parsed.grantScopes === 'object' ? parsed.grantScopes : {};
}

export function useGrantScopes(orgId) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = String(user?.userId || user?._id || user?.id || '').trim();
  const id = String(orgId || '').trim();
  const enabled = Boolean(id && userId);

  const query = useQuery({
    queryKey: queryKeys.rbac.grants(id, userId),
    queryFn: () => fetchGrantScopes(userId, id),
    enabled,
    staleTime: STALE_TIME_RBAC_GRANTS_MS,
    retry: 1,
  });

  const inAdminSystem = useContext(AdminSystemGrantContext);
  const grantScopes = enabled && query.data && typeof query.data === 'object' ? query.data : EMPTY_SCOPES;
  const grants = useMemo(() => Object.keys(grantScopes), [grantScopes]);
  const loading = enabled && query.isPending;
  const error = Boolean(enabled && query.isError);

  const reload = useCallback(async () => {
    if (!enabled) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.rbac.grants(id, userId) });
  }, [enabled, id, userId, queryClient]);

  const hasGrant = useCallback(
    (key) => {
      const normalized = String(key || '').trim().toLowerCase();
      if (!normalized) return false;
      if (inAdminSystem) return true;
      return Object.prototype.hasOwnProperty.call(grantScopes, normalized);
    },
    [grantScopes, inAdminSystem]
  );

  const scopeOf = useCallback(
    (key) => {
      const normalized = String(key || '').trim().toLowerCase();
      if (inAdminSystem && normalized) return 'SYSTEM';
      return grantScopes[normalized] || null;
    },
    [grantScopes, inAdminSystem]
  );

  return { grantScopes, grants, hasGrant, scopeOf, loading, error, reload };
}

/** @deprecated Prefer useGrantScopes */
export const useEffectiveMasterGrants = useGrantScopes;
export const fetchEffectiveMasterGrants = fetchGrantScopes;

export default useGrantScopes;
