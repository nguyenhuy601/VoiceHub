import { useCallback, useEffect, useState } from 'react';
import roleAPI from '../services/api/roleAPI';
import { memberIsWithoutRbacRole, memberUserId } from '../utils/adminUserUtils';
import { unwrapList } from '../utils/adminRbacUtils';
import { useAdminMembers } from './useAdminMembers';

export default function useRbacRolelessAssignments(orgId, { enabled = true } = {}) {
  const { members } = useAdminMembers(orgId);
  const [assignmentsByUser, setAssignmentsByUser] = useState({});
  const [assignmentsReady, setAssignmentsReady] = useState(false);

  const reloadAssignments = useCallback(async () => {
    if (!enabled || !orgId) {
      setAssignmentsByUser({});
      setAssignmentsReady(false);
      return;
    }
    setAssignmentsReady(false);
    const rows = Array.isArray(members) ? members : [];
    if (!rows.length) {
      setAssignmentsByUser({});
      setAssignmentsReady(true);
      return;
    }
    const entries = await Promise.all(
      rows.map(async (m) => {
        const uid = memberUserId(m);
        if (!uid) return null;
        try {
          const res = await roleAPI.getUserRoles(uid, orgId);
          return [uid, unwrapList(res)];
        } catch {
          return null;
        }
      })
    );
    setAssignmentsByUser(Object.fromEntries(entries.filter(Boolean)));
    setAssignmentsReady(true);
  }, [enabled, orgId, members]);

  useEffect(() => {
    if (!enabled) {
      setAssignmentsByUser({});
      setAssignmentsReady(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      await reloadAssignments();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, reloadAssignments]);

  const rolelessFilter = useCallback(
    (m) => (assignmentsReady ? memberIsWithoutRbacRole(m, assignmentsByUser) : false),
    [assignmentsReady, assignmentsByUser]
  );

  return { rolelessFilter, reloadAssignments, assignmentsReady };
}
