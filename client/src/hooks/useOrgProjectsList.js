import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { projectAPI } from '../services/api/projectAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_PROJECTS_LIST_MS } from '../lib/queryClient';

function unwrapProjectList(res) {
  const raw = res?.data?.projects ?? res?.projects ?? res?.data?.data ?? res?.data ?? res ?? [];
  return Array.isArray(raw) ? raw : [];
}

/**
 * @param {string} organizationId
 * @param {{ excludeClosed?: boolean }} [params]
 */
export async function fetchOrgProjectsList(organizationId, params = {}) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const excludeClosed = Boolean(params.excludeClosed);
  const res = await projectAPI.list({
    organizationId: orgId,
    ...(excludeClosed ? { excludeClosed: 1 } : {}),
  });
  return unwrapProjectList(res);
}

/**
 * Shared React Query list for org projects (landing).
 * @param {string} organizationId
 * @param {{ excludeClosed?: boolean, enabled?: boolean }} [options]
 */
export default function useOrgProjectsList(organizationId, options = {}) {
  const orgId = String(organizationId || '').trim();
  const excludeClosed = Boolean(options.excludeClosed);
  const enabled = options.enabled !== false && Boolean(orgId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.projects.list(orgId, { excludeClosed }),
    queryFn: () => fetchOrgProjectsList(orgId, { excludeClosed }),
    enabled,
    staleTime: STALE_TIME_PROJECTS_LIST_MS,
  });

  const projects = enabled ? query.data ?? [] : [];
  const loading = Boolean(enabled) && query.isPending;
  const isError = Boolean(enabled) && query.isError;

  const reload = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projects.listAll(orgId),
    });
  }, [orgId, queryClient]);

  return {
    projects,
    loading,
    isError,
    error: query.error,
    reload,
    query,
  };
}
