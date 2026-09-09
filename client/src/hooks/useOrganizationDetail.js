import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationAPI } from '../services/api/organizationAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_ORG_DETAIL_MS } from '../lib/queryClient';

function unwrapOrg(payload) {
  const data = payload?.data ?? payload;
  return data?.data ?? data ?? null;
}

export async function fetchOrganizationDetail(orgId) {
  const payload = await organizationAPI.getOrganization(orgId);
  return unwrapOrg(payload);
}

/**
 * Shared org detail — CompanyAdminLayout + OrganizationSettingsPanel.
 */
export function useOrganizationDetail(orgId, { enabled: enabledProp = true } = {}) {
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const enabled = enabledProp && Boolean(id);

  const query = useQuery({
    queryKey: queryKeys.org.detail(id),
    queryFn: () => fetchOrganizationDetail(id),
    enabled,
    staleTime: STALE_TIME_ORG_DETAIL_MS,
  });

  const reload = useCallback(async () => {
    if (!id) return null;
    await queryClient.invalidateQueries({ queryKey: queryKeys.org.detail(id) });
    const result = await queryClient.fetchQuery({
      queryKey: queryKeys.org.detail(id),
      queryFn: () => fetchOrganizationDetail(id),
    });
    return result;
  }, [id, queryClient]);

  return {
    organization: enabled ? query.data ?? null : null,
    loading: enabled && query.isPending,
    isError: enabled && query.isError,
    error: query.error,
    reload,
    query,
  };
}

export default useOrganizationDetail;
