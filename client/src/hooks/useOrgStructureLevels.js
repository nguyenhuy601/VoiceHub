/** Huy: Levels đã setup (OrgLevelSchema) — dùng để gated parent fields CRUD. */
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationAPI } from '../services/api/organizationAPI';
import { unwrapOrgApi } from '../utils/adminOrgStructureUtils';
import { resolveOrgUnitCreateParents } from '../utils/orgUnitCreateParents';
import { queryKeys } from '../lib/queryKeys';
import { STALE_TIME_ORG_LEVELS_MS } from '../lib/queryClient';

/**
 * @typedef {{ levels: object[], setupCompleted: boolean, templateId: string }} OrgStructureLevelsSchema
 */

export async function fetchOrgStructureLevels(orgId) {
  const res = await organizationAPI.getStructureLevels(orgId);
  const schema = unwrapOrgApi(res);
  return {
    levels: Array.isArray(schema?.levels) ? schema.levels : [],
    setupCompleted: Boolean(schema?.setupCompleted),
    templateId: String(schema?.templateId || ''),
  };
}

/**
 * @param {string} orgId
 * @param {{ enabled?: boolean }} [options]
 */
export function useOrgStructureLevels(orgId, options = {}) {
  const queryClient = useQueryClient();
  const id = String(orgId || '').trim();
  const enabledProp = options.enabled !== false;
  const enabled = enabledProp && Boolean(id);

  const query = useQuery({
    queryKey: queryKeys.org.levels(id),
    queryFn: () => fetchOrgStructureLevels(id),
    enabled,
    staleTime: STALE_TIME_ORG_LEVELS_MS,
  });

  const schemaLevels = enabled && Array.isArray(query.data?.levels) ? query.data.levels : [];
  const levels = useMemo(
    () => schemaLevels.filter((l) => l && l.enabled !== false && l.key),
    [schemaLevels]
  );
  const setupCompleted = !enabled
    ? null
    : query.isFetched
      ? Boolean(query.data?.setupCompleted)
      : null;
  const templateId = enabled ? String(query.data?.templateId || '') : '';
  const loading = enabled && query.isPending;
  const ready = !enabled || query.isFetched;

  const reload = useCallback(async () => {
    if (!id) return;
    await queryClient.invalidateQueries({ queryKey: queryKeys.org.levels(id) });
  }, [id, queryClient]);

  const enabledKeys = useMemo(
    () => new Set(levels.map((l) => String(l.key).toLowerCase().trim())),
    [levels]
  );

  const hasLevel = useCallback(
    (key) => enabledKeys.has(String(key || '').toLowerCase().trim()),
    [enabledKeys]
  );

  /** Parent level ngay trên (order nhỏ hơn gần nhất) — null nếu là tầng gốc. */
  const parentLevelKey = useCallback(
    (childKey) => {
      const child = levels.find((l) => String(l.key).toLowerCase() === String(childKey).toLowerCase());
      if (!child) return null;
      const childOrder = Number(child.order) || 0;
      const parents = levels
        .filter((l) => Number(l.order) < childOrder)
        .sort((a, b) => Number(b.order) - Number(a.order));
      return parents[0]?.key || null;
    },
    [levels]
  );

  const createParents = useMemo(() => resolveOrgUnitCreateParents(enabledKeys), [enabledKeys]);

  return {
    levels,
    schemaLevels,
    setupCompleted,
    templateId,
    loading,
    ready,
    reload,
    hasLevel,
    parentLevelKey,
    enabledKeys,
    createParents,
  };
}

export default useOrgStructureLevels;
