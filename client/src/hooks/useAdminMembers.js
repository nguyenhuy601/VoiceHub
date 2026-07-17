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

  const [membersByIdAll, setMembersByIdAll] = useState(() => new Map());

  const loadMembers = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await organizationAPI.getMembersWithRoles(orgId);
      const data = unwrapApi(res);
      const bundle = data?.data ?? data;
      const list = bundle?.members || bundle;
      const all = Array.isArray(list) ? list : [];
      // Ẩn tài khoản hệ thống (systemRole=admin) khỏi danh sách quản lý user.
      const visible = all.filter(
        (m) => String(m?.systemRole || '').trim().toLowerCase() !== 'admin'
      );
      setMembers(visible);
      setRoles(Array.isArray(bundle?.roles) ? bundle.roles : []);
      // Map đầy đủ để resolve tên trưởng phòng/nhóm kể cả user bị ẩn khỏi list.
      const byId = new Map();
      for (const m of all) {
        const id = memberUserId(m);
        if (id) byId.set(id, m);
      }
      setMembersByIdAll(byId);
    } catch (error) {
      toast.error(resolveApiErrorMessage(error, { t, fallback: t('companyAdmin.loadMembersFail') }));
      setMembers([]);
      setRoles([]);
      setMembersByIdAll(new Map());
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

  return {
    members,
    roles,
    loading,
    loadMembers,
    membersById,
    /** Lookup tên (gồm system admin) — dùng cột Trưởng phòng / Trưởng nhóm. */
    membersByIdAll,
  };
}

export default useAdminMembers;
