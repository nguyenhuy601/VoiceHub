/** Huy: Domain Cơ cấu tổ chức — admin org-structure */
import { useCallback, useMemo, useRef } from 'react';
import toast from 'react-hot-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationAPI } from '../services/api/organizationAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { flattenOrgStructure, unwrapOrgApi } from '../utils/adminOrgStructureUtils';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_ORG_STRUCTURE_MS } from '../lib/queryClient';

/**
 * @param {string} orgId
 * @param {boolean} includeInactive
 */
export async function fetchAdminOrgStructure(orgId, includeInactive, { t, showToast = true } = {}) {
  try {
    const res = await organizationAPI.getStructure(orgId, { includeInactive });
    return unwrapOrgApi(res) || null;
  } catch (error) {
    if (showToast && t) {
      const msg = resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') });
      toast.error(msg);
    }
    throw error;
  }
}

/**
 * Invalidate both includeInactive variants after CRUD.
 * @param {import('@tanstack/react-query').QueryClient} queryClient
 * @param {string} orgId
 */
export function invalidateOrgStructureQueries(queryClient, orgId) {
  const id = String(orgId || '').trim();
  if (!id) return Promise.resolve();
  return queryClient.invalidateQueries({ queryKey: queryKeys.org.structureAll(id) });
}

/**
 * @param {string} orgId
 * @param {{ includeInactive?: boolean }} [options] — panel vô hiệu / embedded hub cần includeInactive
 */
export function useAdminOrgStructure(orgId, options = {}) {
  const includeInactive = Boolean(options.includeInactive);
  const { t } = useAppStrings();
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const toastedRef = useRef('');

  const query = useQuery({
    queryKey: queryKeys.org.structure(id, includeInactive),
    queryFn: async () => {
      try {
        return await fetchAdminOrgStructure(id, includeInactive, { t, showToast: false });
      } catch (error) {
        const msg = resolveApiErrorMessage(error, { t, fallback: t('adminOrg.loadFail') });
        const toastKey = `${id}:${includeInactive}:${msg}`;
        if (toastedRef.current !== toastKey) {
          toastedRef.current = toastKey;
          toast.error(msg);
        }
        throw error;
      }
    },
    enabled: Boolean(id),
    staleTime: STALE_TIME_ORG_STRUCTURE_MS,
  });

  const structure = id && query.data !== undefined ? query.data : null;
  const loading = Boolean(id) && query.isPending;
  const error =
    id && query.isError
      ? resolveApiErrorMessage(query.error, { t, fallback: t('adminOrg.loadFail') })
      : '';

  const loadStructure = useCallback(async () => {
    if (!id) return;
    await invalidateOrgStructureQueries(queryClient, id);
  }, [id, queryClient]);

  const flat = useMemo(() => flattenOrgStructure(structure), [structure]);

  return {
    structure,
    error,
    loading,
    loadStructure,
    branches: flat.branches,
    divisions: flat.divisions,
    departments: flat.departments,
    teams: flat.teams,
  };
}

export default useAdminOrgStructure;
