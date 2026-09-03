import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { requirementAPI } from '../services/api/requirementAPI';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_REQUIREMENT_PACKS_MS } from '../lib/queryClient';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

function normalizePackList(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.packs)) return raw.packs;
  return [];
}

/**
 * @param {string} organizationId
 * @param {{ status?: string }} [params]
 */
export async function fetchRequirementPacks(organizationId, params = {}) {
  const orgId = String(organizationId || '').trim();
  if (!orgId) return [];
  const status = String(params.status || '').trim();
  const res = await requirementAPI.listPacks(orgId, status ? { status } : {});
  const list = normalizePackList(unwrap(res));
  if (!status) return list;
  return list.filter((p) => String(p?.status || '') === status);
}

/**
 * Shared React Query list for requirement packs (dedupe StrictMode + multi-mount).
 * @param {string} organizationId
 * @param {{ status?: string, enabled?: boolean }} [options]
 */
export default function useRequirementPacks(organizationId, options = {}) {
  const orgId = String(organizationId || '').trim();
  const status = String(options.status || '').trim();
  const enabled = options.enabled !== false && Boolean(orgId);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.requirements.packs(orgId, status),
    queryFn: () => fetchRequirementPacks(orgId, status ? { status } : {}),
    enabled,
    staleTime: STALE_TIME_REQUIREMENT_PACKS_MS,
  });

  const packs = enabled ? query.data ?? [] : [];
  const loading = Boolean(enabled) && query.isPending;
  const isError = Boolean(enabled) && query.isError;

  const reload = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.requirements.packs(orgId, status),
    });
  }, [orgId, queryClient, status]);

  /** Invalidate all pack list variants for this org (all + status filters). */
  const invalidateAllForOrg = useCallback(async () => {
    if (!orgId) return;
    await queryClient.invalidateQueries({
      queryKey: [...queryKeys.requirements.all, 'packs', orgId],
    });
  }, [orgId, queryClient]);

  return {
    packs,
    loading,
    isError,
    error: query.error,
    reload,
    invalidateAllForOrg,
    query,
  };
}
