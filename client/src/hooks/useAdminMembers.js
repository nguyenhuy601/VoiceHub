import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { useAppStrings } from '../locales/appStrings';
import { memberUserId } from '../utils/adminUserUtils';
import {
  fetchAdminMembers,
  getAdminMembersSnapshot,
  removeAdminMember,
  subscribeAdminMembers,
  VIEW_ADMIN_TABLE,
} from '../stores/adminMembersStore';

/**
 * @param {string} orgId
 * @param {{ view?: 'directory'|'admin_table' }} [options]
 */
export function useAdminMembers(orgId, options = {}) {
  const { t } = useAppStrings();
  const tRef = useRef(t);
  tRef.current = t;
  const view = options.view === 'directory' ? 'directory' : VIEW_ADMIN_TABLE;

  const getSnapshot = useCallback(() => getAdminMembersSnapshot(orgId), [orgId]);

  const snapshot = useSyncExternalStore(
    (cb) => subscribeAdminMembers(orgId, cb),
    getSnapshot,
    getSnapshot
  );

  const loadMembers = useCallback(
    () => fetchAdminMembers(orgId, { t: tRef.current, force: true, view }),
    [orgId, view]
  );

  useEffect(() => {
    if (!orgId) return undefined;
    fetchAdminMembers(orgId, { t: tRef.current, force: false, view });
    return undefined;
  }, [orgId, view]);

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
    error: snapshot.error,
    loadMembers,
    removeMemberLocally,
    membersById,
    /** Lookup tên (gồm system admin) — dùng cột Trưởng phòng / Trưởng nhóm. */
    membersByIdAll: snapshot.membersByIdAll,
    hydratedView: snapshot.hydratedView,
  };
}

export default useAdminMembers;
