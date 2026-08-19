import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import roleAPI from '../services/api/roleAPI';
import { parseUserPermissionsPayload } from '../config/rbacUiGrantMap';

/**
 * Master grants V2 của user hiện tại trong org (GET /permissions/user/:me/server/:orgId).
 */
export function useEffectiveMasterGrants(orgId) {
  const { user } = useAuth();
  const userId = String(user?.userId || user?._id || user?.id || '').trim();
  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(Boolean(orgId && userId));

  const reload = useCallback(async () => {
    if (!orgId || !userId) {
      setGrants([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await roleAPI.getUserPermissions(userId, orgId);
      const parsed = parseUserPermissionsPayload(res);
      setGrants(
        parsed.masterGrants
          .map((k) => String(k || '').trim().toLowerCase())
          .filter(Boolean)
      );
    } catch {
      setGrants([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const grantSet = useMemo(() => new Set(grants), [grants]);
  const hasGrant = useCallback(
    (key) => grantSet.has(String(key || '').trim().toLowerCase()),
    [grantSet]
  );

  return { grants, hasGrant, loading, reload };
}

export default useEffectiveMasterGrants;
