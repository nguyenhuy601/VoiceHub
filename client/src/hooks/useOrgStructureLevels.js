/** Huy: Levels đã setup (OrgLevelSchema) — dùng để gated parent fields CRUD. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { organizationAPI } from '../services/api/organizationAPI';
import { unwrapOrgApi } from '../utils/adminOrgStructureUtils';
import { resolveOrgUnitCreateParents } from '../utils/orgUnitCreateParents';

export function useOrgStructureLevels(orgId) {
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(Boolean(orgId));
  const [ready, setReady] = useState(false);

  const reload = useCallback(async () => {
    if (!orgId) {
      setLevels([]);
      setReady(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await organizationAPI.getStructureLevels(orgId);
      const schema = unwrapOrgApi(res);
      const list = Array.isArray(schema?.levels)
        ? schema.levels.filter((l) => l && l.enabled !== false && l.key)
        : [];
      setLevels(list);
    } catch {
      setLevels([]);
    } finally {
      setReady(true);
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    setReady(false);
    reload();
  }, [reload]);

  const enabledKeys = useMemo(
    () => new Set(levels.map((l) => String(l.key).toLowerCase().trim())),
    [levels]
  );

  const hasLevel = useCallback((key) => enabledKeys.has(String(key || '').toLowerCase().trim()), [enabledKeys]);

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

  return { levels, loading, ready, reload, hasLevel, parentLevelKey, enabledKeys, createParents };
}

export default useOrgStructureLevels;
