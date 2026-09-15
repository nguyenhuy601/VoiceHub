import { useCallback, useEffect, useRef, useState } from 'react';
import { projectAPI } from '../../../services/api/projectAPI';
import {
  ROLE_SUGGEST_PAGE_SIZE,
  mergeRoleSuggestItems,
} from './projectWizardIntakeRoles';

function unwrap(res) {
  return res?.data?.data ?? res?.data ?? res;
}

/**
 * Infinite scroll một cột roleSuggest: append offset = items.length, limit = 3.
 */
export function useRoleSuggestColumn({
  orgId,
  roleKey,
  initialItems = [],
  initialHasMore = false,
  enabled = true,
  fitAvailable = true,
} = {}) {
  const seed = (Array.isArray(initialItems) ? initialItems : [])
    .map((row) => String(row?.userId || ''))
    .join(',');

  const [items, setItems] = useState(() => (Array.isArray(initialItems) ? initialItems : []));
  const [hasMore, setHasMore] = useState(Boolean(initialHasMore));
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    setItems(Array.isArray(initialItems) ? initialItems : []);
    setHasMore(Boolean(initialHasMore));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed captures first-page identity
  }, [orgId, roleKey, seed, initialHasMore, fitAvailable]);

  useEffect(() => {
    return () => {
      seqRef.current += 1;
    };
  }, []);

  const fetchMore = useCallback(async () => {
    if (!enabled || !orgId || !roleKey || !hasMore || loadingRef.current) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const seq = ++seqRef.current;
    try {
      const offset = items.length;
      const params = {
        view: 'roleSuggest',
        projectRoleKeys: roleKey,
        limit: ROLE_SUGGEST_PAGE_SIZE,
        offset,
        ...(fitAvailable ? { fitAvailable: 1 } : {}),
      };
      const res = await projectAPI.listOrgResourcePool(orgId, params, {
        skipPermissionDeniedToast: true,
      });
      if (seq !== seqRef.current) return;
      const data = unwrap(res);
      const next = Array.isArray(data?.byRole?.[roleKey]) ? data.byRole[roleKey] : [];
      setItems((prev) => mergeRoleSuggestItems(prev, next));
      setHasMore(Boolean(data?.paging?.hasMoreByRole?.[roleKey]));
    } catch {
      if (seq !== seqRef.current) return;
    } finally {
      if (seq === seqRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [enabled, orgId, roleKey, hasMore, items.length, fitAvailable]);

  return { items, hasMore, loadingMore, fetchMore };
}

export { ROLE_SUGGEST_PAGE_SIZE };
