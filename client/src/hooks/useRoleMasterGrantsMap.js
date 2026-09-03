import { useCallback, useMemo } from 'react';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import roleAPI from '../services/api/roleAPI';
import { normalizeRoleId, unwrapRoleApi } from '../utils/adminRbacUtils';
import { flattenCatalogTree, normalizeMasterGrantList, unwrapCatalogPayload } from '../utils/rbacV2Ui';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_RBAC_CATALOG_MS, STALE_TIME_RBAC_GRANTS_MS } from '../lib/queryClient';

function groupFromBinding(binding) {
  return binding?.group || binding || null;
}

export async function fetchRbacCatalog() {
  const res = await roleAPI.getRbacCatalog();
  return unwrapCatalogPayload(res);
}

export async function fetchRolePermissionGroups(roleId, orgId) {
  const res = await roleAPI.listRolePermissionGroups(roleId, orgId);
  const data = unwrapRoleApi(res) || [];
  return Array.isArray(data) ? data : [];
}

export function grantsFromRoleBindings(bindings) {
  const list = Array.isArray(bindings) ? bindings : [];
  const merged = new Set();
  for (const binding of list) {
    const group = groupFromBinding(binding);
    for (const g of group?.grants || []) {
      const key = String(g || '').trim();
      if (key) merged.add(key);
    }
  }
  return normalizeMasterGrantList([...merged]);
}

/** Shared RBAC V2 catalog (GET /permissions/catalog). */
export function useRbacCatalog({ enabled = true } = {}) {
  return useQuery({
    queryKey: queryKeys.rbac.catalog(),
    queryFn: fetchRbacCatalog,
    enabled,
    staleTime: STALE_TIME_RBAC_CATALOG_MS,
  });
}

/** Permission group bindings for one role. */
export function useRolePermissionGroups(orgId, roleId, { enabled: enabledProp = true } = {}) {
  const id = String(orgId || '').trim();
  const rid = String(roleId || '').trim();
  const enabled = enabledProp && Boolean(id && rid);
  return useQuery({
    queryKey: queryKeys.rbac.roleGroups(id, rid),
    queryFn: () => fetchRolePermissionGroups(rid, id),
    enabled,
    staleTime: STALE_TIME_RBAC_GRANTS_MS,
  });
}

/**
 * Catalog tree + master grants theo role (từ Permission Group bindings, không Role.permissions).
 */
export function useRoleMasterGrantsMap(orgId, roles = []) {
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const roleIdList = useMemo(
    () =>
      (Array.isArray(roles) ? roles : [])
        .map((role) => normalizeRoleId(role))
        .filter(Boolean),
    [roles]
  );

  const catalogQuery = useRbacCatalog({ enabled: Boolean(id) });

  const groupQueries = useQueries({
    queries: roleIdList.map((roleId) => ({
      queryKey: queryKeys.rbac.roleGroups(id, roleId),
      queryFn: () => fetchRolePermissionGroups(roleId, id),
      enabled: Boolean(id && roleId),
      staleTime: STALE_TIME_RBAC_GRANTS_MS,
    })),
  });

  const catalog = catalogQuery.data ?? null;
  const grantsByRoleId = useMemo(() => {
    const entries = roleIdList.map((roleId, index) => {
      const bindings = groupQueries[index]?.data;
      if (!bindings) return [roleId, []];
      return [roleId, grantsFromRoleBindings(bindings)];
    });
    return Object.fromEntries(entries);
  }, [roleIdList, groupQueries]);

  const loading =
    Boolean(id) &&
    (catalogQuery.isPending || groupQueries.some((q) => q.isPending && q.fetchStatus !== 'idle'));
  const error = catalogQuery.isError ? catalogQuery.error?.message || 'catalog' : '';

  const reload = useCallback(async () => {
    if (!id) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.rbac.catalog() }),
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.rbac.all, 'role-groups', id],
      }),
    ]);
  }, [id, queryClient]);

  const slots = flattenCatalogTree(catalog?.tree || []).filter((row) => row.categoryKey !== 'project');

  return { catalog, grantsByRoleId, slots, loading, error, reload };
}

export default useRoleMasterGrantsMap;
