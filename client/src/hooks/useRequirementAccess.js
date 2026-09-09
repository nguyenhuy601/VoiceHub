import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requirementAPI } from '../services/api/requirementAPI';
import { normalizeRequirementAccess } from '../utils/requirementAccessUtils';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_REQUIREMENT_ACCESS_MS } from '../lib/queryClient';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

export async function fetchRequirementAccess(organizationId) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return normalizeRequirementAccess(null);
  try {
    const res = await requirementAPI.getAccess(orgId);
    return normalizeRequirementAccess(unwrap(res));
  } catch {
    return normalizeRequirementAccess(null);
  }
}

export default function useRequirementAccess(organizationId) {
  const orgId = String(organizationId || '').trim();
  const queryClient = useQueryClient();
  const denied = normalizeRequirementAccess(null);

  const query = useQuery({
    queryKey: queryKeys.requirements.access(orgId),
    queryFn: () => fetchRequirementAccess(orgId),
    enabled: Boolean(orgId),
    staleTime: STALE_TIME_REQUIREMENT_ACCESS_MS,
  });

  const access = orgId ? query.data ?? denied : denied;
  const loading = Boolean(orgId) && query.isPending;
  const loaded = !orgId || query.isFetched;

  const reload = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.requirements.access(orgId) });
  }, [orgId, queryClient]);

  return { access, loading, loaded, reload };
}
