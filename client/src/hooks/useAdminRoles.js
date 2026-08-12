import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAppStrings } from '../locales/appStrings';
import {
  isSystemCatalogRole,
  normalizeRoleId,
} from '../utils/adminRbacUtils';
import {
  fetchAdminRoles,
  getAdminRolesSnapshot,
  removeAdminRole,
  subscribeAdminRoles,
} from '../stores/adminRolesStore';

export function useAdminRoles(orgId) {
  const { t } = useAppStrings();
  const tRef = useRef(t);
  tRef.current = t;

  const getSnapshot = useCallback(() => getAdminRolesSnapshot(orgId), [orgId]);

  const snapshot = useSyncExternalStore(
    (cb) => subscribeAdminRoles(orgId, cb),
    getSnapshot,
    getSnapshot
  );

  const loadRoles = useCallback(
    () => fetchAdminRoles(orgId, { t: tRef.current }),
    [orgId]
  );

  useEffect(() => {
    if (!orgId) return undefined;
    fetchAdminRoles(orgId, { t: tRef.current });
    return undefined;
  }, [orgId]);

  const systemRoles = useMemo(
    () =>
      snapshot.roles
        .filter(isSystemCatalogRole)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0)),
    [snapshot.roles]
  );

  const rolesById = useMemo(() => {
    const map = new Map();
    for (const role of snapshot.roles) {
      const id = normalizeRoleId(role);
      if (id) map.set(id, role);
    }
    return map;
  }, [snapshot.roles]);

  const removeRoleLocally = useCallback(
    (roleId) => {
      removeAdminRole(orgId, roleId);
    },
    [orgId]
  );

  return {
    roles: snapshot.roles,
    systemRoles,
    loading: snapshot.loading,
    loadRoles,
    removeRoleLocally,
    rolesById,
  };
}

export default useAdminRoles;
