import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import roleAPI from '../services/api/roleAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import {
  isSystemCatalogRole,
  normalizeRoleId,
  unwrapList,
} from '../utils/adminRbacUtils';

export function useAdminRoles(orgId) {
  const { t } = useAppStrings();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadRoles = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await roleAPI.getRolesByOrganization(orgId);
      const list = unwrapList(res);
      setRoles(Array.isArray(list) ? list : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('adminRbac.loadFail') }));
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  const systemRoles = useMemo(
    () =>
      roles
        .filter(isSystemCatalogRole)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0)),
    [roles]
  );

  const rolesById = useMemo(() => {
    const map = new Map();
    for (const role of roles) {
      const id = normalizeRoleId(role);
      if (id) map.set(id, role);
    }
    return map;
  }, [roles]);

  return { roles, systemRoles, loading, loadRoles, rolesById };
}

export default useAdminRoles;
