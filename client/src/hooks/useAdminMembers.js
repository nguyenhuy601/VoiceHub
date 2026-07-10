import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { organizationAPI } from '../services/api/organizationAPI';
import { useAppStrings } from '../locales/appStrings';
import { resolveApiErrorMessage } from '../utils/resolveApiErrorMessage';
import { memberUserId, unwrapApi } from '../utils/adminUserUtils';

export function useAdminMembers(orgId) {
  const { t } = useAppStrings();
  const [members, setMembers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getMembersWithRoles(orgId);
      const data = unwrapApi(res);
      const bundle = data?.data ?? data;
      const list = bundle?.members || bundle;
      setMembers(Array.isArray(list) ? list : []);
      setRoles(Array.isArray(bundle?.roles) ? bundle.roles : []);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') }));
      setMembers([]);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  }, [orgId, t]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const membersById = useMemo(() => {
    const map = new Map();
    for (const m of members) {
      const id = memberUserId(m);
      if (id) map.set(id, m);
    }
    return map;
  }, [members]);

  return { members, roles, loading, loadMembers, membersById };
}

export default useAdminMembers;
