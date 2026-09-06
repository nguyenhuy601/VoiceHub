import { useCallback, useMemo } from 'react';
import { memberIsWithoutRbacRole, memberUserId } from '../utils/adminUserUtils';
import { useAdminMembers } from './useAdminMembers';

/**
 * RBAC roleless queue — dùng rbacRoles từ with-roles?view=admin_table (store),
 * không N× getUserRoles.
 */
export default function useRbacRolelessAssignments(orgId, { enabled = true } = {}) {
  const { members, loadMembers, loading } = useAdminMembers(orgId, { view: 'admin_table' });

  const assignmentsByUser = useMemo(() => {
    if (!enabled) return {};
    const map = {};
    for (const m of members) {
      const uid = memberUserId(m);
      if (!uid) continue;
      map[uid] = Array.isArray(m.rbacRoles) ? m.rbacRoles : [];
    }
    return map;
  }, [enabled, members]);

  const assignmentsReady = Boolean(enabled && !loading);

  const reloadAssignments = useCallback(async () => {
    if (!enabled || !orgId) return;
    await loadMembers();
  }, [enabled, orgId, loadMembers]);

  const rolelessFilter = useCallback(
    (m) => (assignmentsReady ? memberIsWithoutRbacRole(m, assignmentsByUser) : false),
    [assignmentsReady, assignmentsByUser]
  );

  return { rolelessFilter, reloadAssignments, assignmentsReady, assignmentsByUser };
}
