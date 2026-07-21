import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAppStrings } from '../locales/appStrings';
import { memberUserId } from '../utils/adminUserUtils';
import {
  fetchAdminMembers,
  getAdminMembersSnapshot,
  removeAdminMember,
  subscribeAdminMembers,
} from '../stores/adminMembersStore';

export function useAdminMembers(orgId) {
  const { t } = useAppStrings();
  const tRef = useRef(t);
  tRef.current = t;

  const getSnapshot = useCallback(() => getAdminMembersSnapshot(orgId), [orgId]);

  const snapshot = useSyncExternalStore(
    (cb) => subscribeAdminMembers(orgId, cb),
    getSnapshot,
    getSnapshot
  );

  const loadMembers = useCallback(
    () => fetchAdminMembers(orgId, { t: tRef.current }),
    [orgId]
  );

  useEffect(() => {
    if (!orgId) return undefined;
    fetchAdminMembers(orgId, { t: tRef.current });
    return undefined;
  }, [orgId]);

  const membersById = useMemo(() => {
    const map = new Map();
    for (const m of snapshot.members) {
      const id = memberUserId(m);
      if (id) map.set(id, m);
    }
    return map;
  }, [snapshot.members]);

  const removeMemberLocally = useCallback(
    (userId) => {
      removeAdminMember(orgId, userId);
    },
    [orgId]
  );

  return {
    members: snapshot.members,
    roles: snapshot.roles,
    loading: snapshot.loading,
    loadMembers,
    removeMemberLocally,
    membersById,
    /** Lookup tên (gồm system admin) — dùng cột Trưởng phòng / Trưởng nhóm. */
    membersByIdAll: snapshot.membersByIdAll,
  };
}

export default useAdminMembers;
